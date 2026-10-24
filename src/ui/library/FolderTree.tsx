import type { LibraryCatalog } from '@core'
import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { expandedFor, folderRows, ROOT, treeKey } from './folder-tree'
import styles from './LibraryPanel.module.css'

/**
 * The library's folders as a tree (the WAI-ARIA tree view pattern), with each folder's item count. The open folder is
 * the selected row and the one Tab reaches; arrow keys move it, Right and Left expand and collapse. Clicking a row
 * opens it and expands it; clicking its twisty only expands or collapses it. In a narrow library the tree shows only
 * the open folder's path and the folders in it until *All folders* opens it.
 */
export const FolderTree = ({ catalog, open, onOpen }: { catalog: LibraryCatalog; open: string | null; onOpen: (id: string | null) => void }) => {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set([ROOT]))
  const [all, setAll] = useState(false)
  const tree = useRef<HTMLUListElement>(null)
  const focusAfterKey = useRef(false)
  // A folder opened from outside (a move, an import) shows: its ancestors expand.
  useEffect(() => setExpanded((current) => expandedFor(catalog.folders, current, open)), [catalog.folders, open])
  const rows = folderRows(catalog, expanded, open)
  useEffect(() => {
    if (!focusAfterKey.current) return
    focusAfterKey.current = false
    tree.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus()
  })

  const choose = (id: string | null) => {
    setExpanded((current) => expandedFor(catalog.folders, current, id, true))
    onOpen(id)
  }
  const toggle = (id: string | null) => setExpanded((current) => {
    const next = new Set(current)
    if (!next.delete(id ?? ROOT)) next.add(id ?? ROOT)
    return next
  })
  const onKeyDown = (event: KeyboardEvent) => {
    const move = treeKey(rows, open, expanded, event.key)
    if (!move) return
    event.preventDefault()
    if (move.expanded) setExpanded(move.expanded)
    if (move.open !== undefined && move.open !== open) {
      focusAfterKey.current = true
      onOpen(move.open)
    }
  }

  return (
    <div className={styles.folders}>
      <button className={styles.allFolders} aria-expanded={all} onClick={() => setAll(!all)}>All folders</button>
      <ul ref={tree} role="tree" aria-label="Library folders" className={all ? `${styles.tree} ${styles.treeOpen}` : styles.tree} onKeyDown={onKeyDown}>
        {rows.map((row) => (
          <li
            key={row.id ?? ROOT}
            role="treeitem"
            aria-level={row.level}
            aria-selected={row.id === open}
            aria-expanded={row.hasChildren ? row.expanded : undefined}
            aria-label={row.count > 0 ? `${row.name}, ${row.count} ${row.count === 1 ? 'item' : 'items'}` : row.name}
            tabIndex={row.id === open ? 0 : -1}
            className={row.id === open ? `${styles.folder} ${styles.active}` : styles.folder}
            data-essential={row.essential || undefined}
            style={{ paddingInlineStart: (row.level - 1) * 12 }}
            onClick={() => choose(row.id)}
          >
            <span
              className={styles.twisty}
              aria-hidden
              onClick={(event) => {
                if (!row.hasChildren) return
                event.stopPropagation()
                toggle(row.id)
              }}
            >
              {row.hasChildren ? (row.expanded ? '▾' : '▸') : ''}
            </span>
            <span className={styles.folderName}>{row.name}</span>
            {row.count > 0 && <span className={styles.count} aria-hidden>{row.count}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
