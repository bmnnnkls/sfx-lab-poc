import type { LibraryCatalog } from '@core'

type Folder = LibraryCatalog['folders'][number]

/** The tree's top row, *All / root*, is the library itself; its id in the expanded set. */
export const ROOT = ''

/** A row the tree shows: a folder, or the root (`id` null). */
export interface FolderRow {
  readonly id: string | null
  readonly name: string
  /** 1 for the root, as `aria-level` counts. */
  readonly level: number
  /** The row's parent, undefined for the root. */
  readonly parentId: string | null | undefined
  /** Items directly in the folder, trash excluded; all items for the root. */
  readonly count: number
  readonly hasChildren: boolean
  readonly expanded: boolean
  /** The open folder, or one of its ancestors: what a narrow tree shows while collapsed. */
  readonly onPath: boolean
}

const key = (id: string | null) => id ?? ROOT

/** The folders above a folder, nearest first. Stops at a missing parent or a cycle. */
export const ancestorsOf = (folders: readonly Folder[], id: string | null): string[] => {
  const ancestors: string[] = []
  let parent = folders.find((folder) => folder.id === id)?.parentId ?? null
  while (parent !== null && !ancestors.includes(parent)) {
    ancestors.push(parent)
    parent = folders.find((folder) => folder.id === parent)?.parentId ?? null
  }
  return ancestors
}

/** The rows the tree shows, depth first: the root, then the folders under each expanded row. */
export const folderRows = (catalog: Pick<LibraryCatalog, 'folders' | 'items'>, expanded: ReadonlySet<string>, open: string | null): FolderRow[] => {
  const folders = catalog.folders.filter((folder) => !folder.trashed)
  const items = catalog.items.filter((item) => !item.trashed)
  const path = new Set([key(open), ...ancestorsOf(folders, open), ROOT])
  const childrenOf = (id: string | null) => folders.filter((folder) => folder.parentId === id)
  const rows: FolderRow[] = []
  const visit = (id: string | null, name: string, level: number, parentId: string | null | undefined, seen: Set<string>) => {
    const children = childrenOf(id).filter((folder) => !seen.has(folder.id))
    const isExpanded = children.length > 0 && expanded.has(key(id))
    rows.push({
      id, name, level, parentId,
      count: id === null ? items.length : items.filter((item) => item.folderId === id).length,
      hasChildren: children.length > 0,
      expanded: isExpanded,
      onPath: path.has(key(id)),
    })
    if (isExpanded) for (const child of children) visit(child.id, child.name, level + 1, id, new Set([...seen, child.id]))
  }
  visit(null, 'All / root', 1, undefined, new Set())
  return rows
}

/** What a key does in the tree (the WAI-ARIA tree view pattern): which folder opens, and what expands. */
export interface TreeMove {
  readonly open?: string | null
  readonly expanded?: ReadonlySet<string>
}

/**
 * Arrow keys move the open folder through the rows, Home and End to the first and last; Right expands a row or moves
 * into it, Left collapses it or moves to its parent; `*` expands the row's siblings. Undefined for other keys.
 */
export const treeKey = (rows: readonly FolderRow[], open: string | null, expanded: ReadonlySet<string>, keyName: string): TreeMove | undefined => {
  const index = Math.max(0, rows.findIndex((row) => row.id === open))
  const row = rows[index]
  if (!row) return undefined
  const toggle = (id: string | null, on: boolean) => {
    const next = new Set(expanded)
    if (on) next.add(key(id))
    else next.delete(key(id))
    return next
  }
  switch (keyName) {
    case 'ArrowDown': return { open: rows[Math.min(rows.length - 1, index + 1)]!.id }
    case 'ArrowUp': return { open: rows[Math.max(0, index - 1)]!.id }
    case 'Home': return { open: rows[0]!.id }
    case 'End': return { open: rows[rows.length - 1]!.id }
    case 'ArrowRight':
      if (!row.hasChildren) return {}
      return row.expanded ? { open: rows[index + 1]!.id } : { expanded: toggle(row.id, true) }
    case 'ArrowLeft':
      if (row.expanded) return { expanded: toggle(row.id, false) }
      return row.parentId === undefined ? {} : { open: row.parentId }
    case '*': {
      const next = new Set(expanded)
      for (const sibling of rows) if (sibling.parentId === row.parentId && sibling.hasChildren) next.add(key(sibling.id))
      return { expanded: next }
    }
    default: return undefined
  }
}

/**
 * The open folder shows: its ancestors expand. With `inside`, so does the folder itself, to show what is in it (a
 * click opens a folder that way; the arrow keys don't).
 */
export const expandedFor = (folders: readonly Folder[], expanded: ReadonlySet<string>, open: string | null, inside = false): ReadonlySet<string> => {
  const wanted = [...(inside ? [key(open)] : []), ...ancestorsOf(folders, open), ROOT]
  return wanted.every((id) => expanded.has(id)) ? expanded : new Set([...expanded, ...wanted])
}
