import type { LibraryCatalog, LibraryItem } from '@core'
import type { DragPayload, DropTarget, LibraryRowRef, Subject } from '@state'
import { type KeyboardEvent, type MouseEvent, useEffect, useRef, useState } from 'react'
import { mergeDragProps, useDragSource, useDropTarget, useSpringOpen } from '../shared/drag'
import { ActionMenu } from '../shared/menu'
import { InPlaceRename, useRenaming } from '../shared/RenameField'
import { expandedFor, folderKey, INITIAL_EXPANDED, itemKey, type LibraryRow, libraryRows, type RowKey, treeKey } from './library-tree'
import styles from './LibraryPanel.module.css'

/** The glyph before an item's name, by its kind. */
const GLYPHS: Record<LibraryItem['content']['kind'], string> = {
  instrument: '♪',
  'audio-effect': '◈',
  'note-effect': '♮',
  preset: '•',
  'midi-clip': '▦',
  'audio-clip': '▤',
  sample: '∿',
}

/** A row's key for the store's active row, and back. */
export const keyOf = (ref: LibraryRowRef | null): RowKey => (!ref ? 'mine' : ref.kind === 'root' ? ref.id : ref.kind === 'folder' ? folderKey(ref.id) : itemKey(ref.id))
export const refOf = (row: LibraryRow): LibraryRowRef => (row.kind === 'root' ? { kind: 'root', id: row.root } : row.kind === 'folder' ? { kind: 'folder', id: row.id } : { kind: 'item', id: row.id })
/** The subject a row's menu and keys act on. */
export const subjectOf = (row: LibraryRow): Subject =>
  row.kind === 'root' ? { kind: 'library-root', root: row.root } : row.kind === 'folder' ? { kind: 'library-folder', folderId: row.id } : { kind: 'library-item', itemId: row.id }

interface RowProps {
  readonly row: LibraryRow
  readonly item: LibraryItem | undefined
  readonly active: boolean
  /** The row Tab reaches. */
  readonly focusable: boolean
  readonly selected: boolean
  readonly previewing: boolean
  onChoose(row: LibraryRow, event: MouseEvent): void
  onToggle(row: LibraryRow): void
  onExpand(row: LibraryRow): void
  onPreview(row: LibraryRow): void
  onRename(subject: Subject, name: string): void
}

/** One row: its menu, a drag source (but a root), a drop target (a folder or a root), and spring-opening when closed. */
const Row = ({ row, item, active, focusable, selected, previewing, onChoose, onToggle, onExpand, onPreview, onRename }: RowProps) => {
  const subject = subjectOf(row)
  const renaming = useRenaming(subject)
  const payload: DragPayload | null = renaming || row.kind === 'root' ? null : (subject as DragPayload)
  const target: DropTarget | null = row.kind === 'root' || row.kind === 'folder' ? (subject as DropTarget) : null
  const drag = useDragSource(payload)
  const drop = useDropTarget(target)
  const spring = useSpringOpen(row.hasChildren && !row.expanded ? () => onExpand(row) : null)
  const count = row.kind === 'root' || row.kind === 'folder' ? row.count : 0
  const playable = row.kind === 'item' || row.kind === 'preset'
  const label = count > 0 ? `${row.name}, ${count} ${count === 1 ? 'item' : 'items'}` : row.name
  return (
    <ActionMenu subject={subject}>
      <li
        role="treeitem"
        aria-level={row.level}
        aria-selected={active || selected}
        aria-expanded={row.hasChildren ? row.expanded : undefined}
        aria-label={label}
        tabIndex={focusable ? 0 : -1}
        className={`${styles.row} ${active ? styles.active : ''} ${selected ? styles.selected : ''} ${row.root === 'trash' && row.kind !== 'root' ? styles.trashed : ''}`}
        style={{ paddingInlineStart: 4 + (row.level - 1) * 14 }}
        data-kind={row.kind}
        data-previewing={previewing || undefined}
        onClick={(event) => onChoose(row, event)}
        onDoubleClick={() => row.kind === 'folder' && onToggle(row)}
        {...mergeDragProps(drag, drop, spring)}
      >
        <span
          className={styles.twisty}
          aria-hidden
          onClick={(event) => {
            if (!row.hasChildren) return
            event.stopPropagation()
            onToggle(row)
          }}
        >
          {row.hasChildren ? (row.expanded ? '▾' : '▸') : ''}
        </span>
        {item && <span className={styles.glyph} aria-hidden>{GLYPHS[item.content.kind]}</span>}
        {row.kind === 'root' ? (
          <span className={`${styles.name} ${styles.rootName}`}>{row.name}</span>
        ) : (
          <InPlaceRename subject={subject} name={row.name} label={`Name of ${row.name}`} className={styles.name} onCommit={(name) => onRename(subject, name)}>
            <span className={styles.name}>{row.name}</span>
          </InPlaceRename>
        )}
        {playable && row.root === 'mine' && (
          <button
            className={styles.play}
            tabIndex={-1}
            aria-label={`${previewing ? 'Stop preview of' : 'Preview'} ${row.name}`}
            title={previewing ? 'Stop preview (Space)' : 'Preview (Space)'}
            onClick={(event) => {
              event.stopPropagation()
              onPreview(row)
            }}
          >
            {previewing ? '■' : '▶'}
          </button>
        )}
        {count > 0 && <span className={styles.count} aria-hidden>{count}</span>}
      </li>
    </ActionMenu>
  )
}

interface LibraryTreeProps {
  readonly catalog: LibraryCatalog
  readonly query: string
  readonly kind: string
  readonly active: LibraryRowRef | null
  readonly selected: readonly string[]
  readonly previewing: string | null
  onActivate(active: LibraryRowRef, selected: readonly string[]): void
  /** Enter on a row: its primary action. */
  onPrimary(row: LibraryRow): void
  /** Space or ▶ on an item: preview it, or stop its preview. */
  onPreview(row: LibraryRow): void
  onRename(subject: Subject, name: string): void
}

/**
 * The library as one tree (the WAI-ARIA tree view pattern): *My library* and *Trash*, folders, items and the presets
 * under their sound. The active row is the one Tab reaches and the details show; the arrows move it, Right and Left
 * expand and collapse, Enter runs its primary action and Space previews. A click makes a row active and selects it,
 * ⇧ extends the selection along the rows and ⌘ toggles a row. Rows drag onto folders and the roots, and a closed row
 * springs open under a resting drag.
 */
export const LibraryTree = ({ catalog, query, kind, active, selected, previewing, onActivate, onPrimary, onPreview, onRename }: LibraryTreeProps) => {
  const [expanded, setExpanded] = useState<ReadonlySet<RowKey>>(INITIAL_EXPANDED)
  const tree = useRef<HTMLUListElement>(null)
  const focusAfterKey = useRef(false)
  const activeKey = keyOf(active)
  // A row made active from outside (Show, a new folder) shows: the rows above it expand.
  useEffect(() => setExpanded((current) => expandedFor(catalog, current, activeKey)), [activeKey])
  const rows = libraryRows(catalog, { expanded, query, kind })
  // The row Tab reaches: the active one, or the first while the active one is hidden (filtered out, collapsed away).
  const focusKey = rows.some((row) => row.key === activeKey) ? activeKey : rows[0]?.key
  useEffect(() => {
    if (!focusAfterKey.current) return
    focusAfterKey.current = false
    tree.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus()
  })
  const items = new Map(catalog.items.map((item) => [item.id, item]))
  const rowItem = (row: LibraryRow) => (row.kind === 'item' || row.kind === 'preset' ? items.get(row.id) : undefined)
  const itemIds = (list: readonly LibraryRow[]) => list.filter((row) => row.kind === 'item' || row.kind === 'preset').map((row) => (row as { id: string }).id)

  const toggle = (row: LibraryRow) => setExpanded((current) => {
    const next = new Set(current)
    if (!next.delete(row.key)) next.add(row.key)
    return next
  })
  const expand = (row: LibraryRow) => setExpanded((current) => new Set([...current, row.key]))
  const choose = (row: LibraryRow, event: MouseEvent) => {
    const ref = refOf(row)
    const isItem = row.kind === 'item' || row.kind === 'preset'
    if (event.shiftKey) {
      // From the active row to this one, along the rows as they show.
      const from = Math.max(0, rows.findIndex((candidate) => candidate.key === activeKey)), to = rows.findIndex((candidate) => candidate.key === row.key)
      onActivate(ref, itemIds(rows.slice(Math.min(from, to), Math.max(from, to) + 1)))
    } else if (event.metaKey || event.ctrlKey) {
      const id = isItem ? (row as { id: string }).id : undefined
      onActivate(ref, id === undefined ? selected : selected.includes(id) ? selected.filter((candidate) => candidate !== id) : [...selected, id])
    } else onActivate(ref, isItem ? [(row as { id: string }).id] : [])
  }
  const onKeyDown = (event: KeyboardEvent) => {
    // Keys typed into a rename field are the field's.
    if (event.target instanceof HTMLInputElement) return
    const row = rows.find((candidate) => candidate.key === activeKey)
    if (row && event.key === 'Enter') {
      event.preventDefault()
      return onPrimary(row)
    }
    if (row && event.key === ' ') {
      event.preventDefault()
      if (row.kind === 'item' || row.kind === 'preset') onPreview(row)
      return
    }
    const move = treeKey(rows, activeKey, expanded, event.key)
    if (!move) return
    event.preventDefault()
    if (move.expanded) setExpanded(move.expanded)
    const next = move.active !== undefined && move.active !== activeKey ? rows.find((candidate) => candidate.key === move.active) : undefined
    if (next) {
      focusAfterKey.current = true
      onActivate(refOf(next), next.kind === 'item' || next.kind === 'preset' ? [next.id] : [])
    }
  }

  return (
    <ul ref={tree} role="tree" aria-label="Library" aria-multiselectable className={styles.tree} onKeyDown={onKeyDown}>
      {rows.map((row) => (
        <Row
          key={row.key}
          row={row}
          item={rowItem(row)}
          active={row.key === activeKey}
          focusable={row.key === focusKey}
          selected={(row.kind === 'item' || row.kind === 'preset') && selected.includes(row.id)}
          previewing={(row.kind === 'item' || row.kind === 'preset') && previewing === row.id}
          onChoose={choose}
          onToggle={toggle}
          onExpand={expand}
          onPreview={onPreview}
          onRename={onRename}
        />
      ))}
    </ul>
  )
}
