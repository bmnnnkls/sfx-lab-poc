import type { ControlOwner, LibraryCatalog, LibraryItem } from '@core'
import { type DragPayload, type DropTarget, type LibraryRowRef, type Subject, libraryClipboard, projectExpandedOf, projectGraphItemId, useClipboard, useLibraryStore, useProjectStore } from '@state'
import { type KeyboardEvent, type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { mergeDragProps, useDragSource, useDropTarget, useSpringOpen } from '../shared/drag'
import { ActionMenu } from '../shared/menu'
import { InPlaceRename, useRenaming } from '../shared/RenameField'
import { expandedFor, folderKey, INITIAL_EXPANDED, isProjectKey, itemKey, type LibraryRow, libraryRows, type ProjectEntry, projectModel, projectRows, type RowKey, treeKey } from './library-tree'
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

/** The glyph before a row of *This project*, by what it is; none for an owner or a heading. */
const projectGlyph = (entry: ProjectEntry): string | undefined => {
  switch (entry.kind) {
    case 'graph': return entry.domain === 'patch' ? GLYPHS.instrument : entry.domain === 'fx' ? GLYPHS['audio-effect'] : GLYPHS['note-effect']
    case 'project-preset': return GLYPHS.preset
    case 'clip': return GLYPHS[entry.clipKind]
    case 'sample': return GLYPHS.sample
    case 'module': return '◇'
    default: return undefined
  }
}

/** The glyph before a root: *This project*'s diamond, the Factory's lock. */
const ROOT_GLYPHS: Partial<Record<LibraryRow['root'], string>> = { project: '◆', factory: '🔒' }

/** A row's key for the store's active row, and back. */
export const keyOf = (ref: LibraryRowRef | null): RowKey => (!ref ? 'mine' : ref.kind === 'root' || ref.kind === 'project' ? ref.id : ref.kind === 'folder' ? folderKey(ref.id) : itemKey(ref.id))
export const refOf = (row: LibraryRow): LibraryRowRef =>
  row.kind === 'root' ? { kind: 'root', id: row.root } : row.kind === 'folder' ? { kind: 'folder', id: row.id } : row.kind === 'project' ? { kind: 'project', id: row.key } : { kind: 'item', id: row.id }

const ownerSubject = (owner: ControlOwner): Subject => (owner.kind === 'track' ? { kind: 'track', trackId: owner.trackId } : owner.kind === 'group' ? { kind: 'group', groupId: owner.groupId } : { kind: 'master' })

/** The subject of a row of *This project*: the project's own thing, with its own menu. None for a heading. */
const projectSubject = (entry: ProjectEntry): Subject | null => {
  switch (entry.kind) {
    case 'owner': return ownerSubject(entry.owner)
    case 'graph': return { kind: 'project-graph', owner: entry.owner, domain: entry.domain }
    case 'project-preset': return { kind: 'sound', soundId: entry.presetId, preset: true }
    case 'clip': return { kind: 'clip', trackId: entry.trackId, clipId: entry.clipId }
    case 'sample': return { kind: 'sample', sampleId: entry.sampleId }
    case 'module': return { kind: 'module', moduleId: entry.moduleId }
    default: return null
  }
}

/**
 * What a row previews: an item or preset of the library by its id, or a graph of *This project* that can be saved by
 * its throwaway item's id; undefined for the rest.
 */
export const previewIdOf = (row: LibraryRow): string | undefined => {
  if (row.kind === 'item' || row.kind === 'preset') return row.root === 'mine' || row.root === 'factory' ? row.id : undefined
  if (row.kind === 'project' && row.entry.kind === 'graph' && !row.entry.reason) return projectGraphItemId(row.entry.owner, row.entry.domain)
  return undefined
}

/** The subject a row's menu and keys act on; none for *This project*'s root, the Factory's or a heading. */
export const subjectOf = (row: LibraryRow): Subject | null =>
  row.kind === 'root'
    ? row.root === 'project' || row.root === 'factory' ? null : { kind: 'library-root', root: row.root }
    : row.kind === 'folder' ? { kind: 'library-folder', folderId: row.id } : row.kind === 'project' ? projectSubject(row.entry) : { kind: 'library-item', itemId: row.id }

/**
 * What a row of *This project* drags: a graph (a refused one too, so its targets can say why), a session clip, a sample
 * or a preset, as from their own views.
 */
const projectPayload = (entry: ProjectEntry, subject: Subject | null): DragPayload | null =>
  entry.kind === 'graph' || entry.kind === 'clip' || entry.kind === 'sample' || entry.kind === 'project-preset' ? (subject as DragPayload) : null

/** The words after a row's name in its label: *8 items* under a heading, *2 presets* on a graph. */
const countLabel = (row: LibraryRow, count: number) => {
  const unit = row.kind === 'project' && row.entry.kind === 'graph' ? 'preset' : 'item'
  return `${count} ${unit}${count === 1 ? '' : 's'}`
}

interface RowProps {
  readonly row: LibraryRow
  readonly item: LibraryItem | undefined
  readonly active: boolean
  /** The row Tab reaches. */
  readonly focusable: boolean
  readonly selected: boolean
  readonly previewing: boolean
  /** Cut, waiting for a paste: drawn dimmed. */
  readonly cut: boolean
  onChoose(row: LibraryRow, event: MouseEvent): void
  onToggle(row: LibraryRow): void
  onExpand(row: LibraryRow): void
  onPreview(row: LibraryRow): void
  onRename(subject: Subject, name: string): void
}

/**
 * One row: its menu, a drag source (but a root), a drop target (a folder or a root of the personal library; the Factory
 * is read-only), and spring-opening when closed.
 */
const NO_SUBJECT: Subject = { kind: 'master' }

const Row = ({ row, item, active, focusable, selected, previewing, cut, onChoose, onToggle, onExpand, onPreview, onRename }: RowProps) => {
  const subject = subjectOf(row)
  const renaming = useRenaming(subject ?? NO_SUBJECT) && subject !== null
  const payload: DragPayload | null = renaming || row.kind === 'root' ? null : row.kind === 'project' ? projectPayload(row.entry, subject) : (subject as DragPayload)
  const target: DropTarget | null = (row.kind === 'root' || row.kind === 'folder') && row.root !== 'project' && row.root !== 'factory' ? (subject as DropTarget) : null
  const drag = useDragSource(payload)
  const drop = useDropTarget(target)
  const spring = useSpringOpen(row.hasChildren && !row.expanded ? () => onExpand(row) : null)
  const count = row.kind === 'root' || row.kind === 'folder' || row.kind === 'project' ? row.count : 0
  const playable = previewIdOf(row) !== undefined
  const label = count > 0 ? `${row.name}, ${countLabel(row, count)}` : row.name
  const glyph = item ? GLYPHS[item.content.kind] : row.kind === 'project' ? projectGlyph(row.entry) : row.kind === 'root' ? ROOT_GLYPHS[row.root] : undefined
  // Why a graph can't be saved or copied: it reads another track.
  const reason = row.kind === 'project' && row.entry.kind === 'graph' ? row.entry.reason : undefined
  return (
    <ActionMenu subject={subject}>
      <li
        role="treeitem"
        aria-level={row.level}
        aria-selected={active || selected}
        aria-expanded={row.hasChildren ? row.expanded : undefined}
        aria-label={label}
        aria-description={reason ?? (row.kind === 'root' && row.root === 'factory' ? 'Read-only' : cut ? 'Cut' : undefined)}
        title={reason ?? (row.kind === 'root' && row.root === 'factory' ? 'Read-only: copy a sound to My library to change it' : undefined)}
        tabIndex={focusable ? 0 : -1}
        className={`${styles.row} ${active ? styles.active : ''} ${selected ? styles.selected : ''} ${row.root === 'trash' && row.kind !== 'root' ? styles.trashed : ''}`}
        style={{ paddingInlineStart: 4 + (row.level - 1) * 14 }}
        data-kind={row.kind}
        data-reason={reason}
        data-previewing={previewing || undefined}
        data-cut={cut || undefined}
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
        {glyph && <span className={styles.glyph} aria-hidden>{glyph}</span>}
        {row.kind === 'root' || !subject ? (
          <span className={`${styles.name} ${row.kind === 'root' ? styles.rootName : ''}`}>{row.name}</span>
        ) : (
          <InPlaceRename subject={subject} name={row.name} label={`Name of ${row.name}`} className={styles.name} onCommit={(name) => onRename(subject, name)}>
            <span className={styles.name}>{row.name}</span>
          </InPlaceRename>
        )}
        {playable && (
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
        {reason && <span className={styles.reason} aria-hidden>⚠</span>}
        {count > 0 && <span className={styles.count} aria-hidden>{count}</span>}
      </li>
    </ActionMenu>
  )
}

interface LibraryTreeProps {
  readonly catalog: LibraryCatalog
  /** The Factory's catalog; null while it loads. */
  readonly factory: LibraryCatalog | null
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
 * The library as one tree (the WAI-ARIA tree view pattern): *This project* (the open project's sounds, clips and
 * samples, live and read-only as a library; collapsed until opened, and kept open per project), then *My library*, the
 * read-only *Factory* (collapsed until opened) and *Trash*, folders, items and the presets under their sound. The active row is the one Tab reaches and the details show; the arrows move it, Right and Left
 * expand and collapse, Enter runs its primary action and Space previews. A click makes a row active and selects it,
 * ⇧ extends the selection along the rows and ⌘ toggles a row. Rows drag onto folders and the roots, and a closed row
 * springs open under a resting drag. Cut rows (⌘X) are dimmed until pasted (⌘V on a folder) or Esc clears them.
 */
export const LibraryTree = ({ catalog, factory, query, kind, active, selected, previewing, onActivate, onPrimary, onPreview, onRename }: LibraryTreeProps) => {
  // *This project*'s rows change with its edits, but not with a value's (a knob dragged): `projectModel` says.
  const model = useProjectStore((state) => projectModel(state.project))
  const epoch = useProjectStore((state) => state.documentEpoch)
  // What is open in the library is the tree's own; what is open under *This project* is kept per project, in the store.
  const [libraryExpanded, setLibraryExpanded] = useState<ReadonlySet<RowKey>>(INITIAL_EXPANDED)
  const projectExpanded = useLibraryStore((state) => projectExpandedOf(state, epoch))
  const expanded = useMemo<ReadonlySet<RowKey>>(() => new Set([...projectExpanded, ...libraryExpanded]), [projectExpanded, libraryExpanded])
  const current = useRef(expanded)
  current.current = expanded
  const setExpanded = useCallback((next: ReadonlySet<RowKey> | ((current: ReadonlySet<RowKey>) => ReadonlySet<RowKey>)) => {
    const value = typeof next === 'function' ? next(current.current) : next
    if (value === current.current) return
    const keys = [...value]
    useLibraryStore.getState().setProjectExpanded(new Set(keys.filter(isProjectKey)))
    setLibraryExpanded(new Set(keys.filter((key) => !isProjectKey(key))))
  }, [])
  const tree = useRef<HTMLUListElement>(null)
  // The rows cut, by key, drawn dimmed until a paste or Esc.
  const clip = useClipboard(libraryClipboard)
  const cutKeys = useMemo(() => new Set(clip?.mode === 'cut' ? clip.entries.map((entry) => (entry.kind === 'library-folder' ? folderKey(entry.folderId) : entry.kind === 'library-item' ? itemKey(entry.itemId) : '')) : []), [clip])
  const focusAfterKey = useRef(false)
  const activeKey = keyOf(active)
  // A row made active from outside (Show, a new folder) shows: the rows above it expand.
  useEffect(() => setExpanded((now) => expandedFor(catalog, now, activeKey, factory)), [activeKey, factory])
  const rows = [...projectRows(model, { expanded, query, kind }), ...libraryRows(catalog, { expanded, query, kind }, factory)]
  // The row Tab reaches: the active one, or the first while the active one is hidden (filtered out, collapsed away).
  const focusKey = rows.some((row) => row.key === activeKey) ? activeKey : rows[0]?.key
  useEffect(() => {
    if (!focusAfterKey.current) return
    focusAfterKey.current = false
    tree.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus()
  })
  const items = new Map([...catalog.items, ...(factory?.items ?? [])].map((item) => [item.id, item]))
  const rowItem = (row: LibraryRow) => (row.kind === 'item' || row.kind === 'preset' ? items.get(row.id) : undefined)
  const itemIds = (list: readonly LibraryRow[]) => list.filter((row) => row.kind === 'item' || row.kind === 'preset').map((row) => (row as { id: string }).id)

  const toggle = (row: LibraryRow) => setExpanded((now) => {
    const next = new Set(now)
    if (!next.delete(row.key)) next.add(row.key)
    return next
  })
  const expand = (row: LibraryRow) => setExpanded((now) => new Set([...now, row.key]))
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
    // Esc clears what was cut.
    if (event.key === 'Escape' && clip?.mode === 'cut') {
      event.preventDefault()
      return libraryClipboard.set(null)
    }
    const row = rows.find((candidate) => candidate.key === activeKey)
    if (row && event.key === 'Enter') {
      event.preventDefault()
      return onPrimary(row)
    }
    if (row && event.key === ' ') {
      event.preventDefault()
      if (row.kind === 'item' || row.kind === 'preset' || previewIdOf(row)) onPreview(row)
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
          previewing={previewing !== null && previewIdOf(row) === previewing}
          cut={cutKeys.has(row.key)}
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
