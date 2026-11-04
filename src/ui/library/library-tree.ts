import type { LibraryCatalog, LibraryFolder, LibraryItem } from '@core'

/** The tree's two roots: the live library and the trash. */
export type LibraryRoot = 'mine' | 'trash'

/** A row's key, unique in the tree and stable across renders: a root's name, `f:` a folder id, `i:` an item id. */
export type RowKey = string
export const folderKey = (id: string): RowKey => `f:${id}`
export const itemKey = (id: string): RowKey => `i:${id}`

interface RowBase {
  readonly key: RowKey
  /** The row above it in the tree; null for a root. */
  readonly parent: RowKey | null
  /** 1 for a root, as `aria-level` counts. */
  readonly level: number
  readonly name: string
  /** The root it is under: whether it is in the trash. */
  readonly root: LibraryRoot
  readonly hasChildren: boolean
  readonly expanded: boolean
}

/**
 * A row the tree shows. A preset shows under its sound (`preset`); one whose sound isn't beside it, trashed or gone,
 * shows as an item in its own folder.
 */
export type LibraryRow =
  | (RowBase & { readonly kind: 'root'; readonly count: number })
  | (RowBase & { readonly kind: 'folder'; readonly id: string; readonly parentId: string | null; readonly count: number })
  | (RowBase & { readonly kind: 'item'; readonly id: string; readonly folderId: string | null; readonly presets: number })
  | (RowBase & { readonly kind: 'preset'; readonly id: string; readonly assetId: string })

export interface RowOptions {
  /** The keys of the expanded rows. */
  readonly expanded: ReadonlySet<RowKey>
  readonly query?: string
  /** An item kind (`instrument`, `midi-clip`, …), or empty for all. */
  readonly kind?: string
}

/** What the tree starts with: *My library* open, the trash closed. */
export const INITIAL_EXPANDED: ReadonlySet<RowKey> = new Set(['mine'])

interface Node {
  readonly key: RowKey
  readonly name: string
  readonly kind: 'folder' | 'item' | 'preset'
  readonly entry: LibraryFolder | LibraryItem
  children: Node[]
}

const byName = (a: Node, b: Node) =>
  (a.kind === 'folder' ? 0 : 1) - (b.kind === 'folder' ? 0 : 1) || a.name.localeCompare(b.name, undefined, { numeric: true }) || (a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : 0)

/**
 * The nodes under one root, sorted: folders first and then items, each by name, numbers in order. In the trash, what
 * was trashed shows at its top-most trashed level: a trashed folder with its contents, an item trashed alone on its own.
 */
const nodesOf = (catalog: Pick<LibraryCatalog, 'folders' | 'items'>, root: LibraryRoot): Node[] => {
  const trashed = root === 'trash'
  const folders = catalog.folders.filter((folder) => !!folder.trashed === trashed)
  const items = catalog.items.filter((item) => !!item.trashed === trashed)
  const folderIds = new Set(folders.map((folder) => folder.id))
  const itemIds = new Set(items.map((item) => item.id))
  const nodes = new Map<string, Node>()
  for (const folder of folders) nodes.set(folderKey(folder.id), { key: folderKey(folder.id), name: folder.name, kind: 'folder', entry: folder, children: [] })
  const soundOf = (item: LibraryItem) => (item.content.kind === 'preset' && itemIds.has(item.content.assetId) ? item.content.assetId : undefined)
  for (const item of items) nodes.set(itemKey(item.id), { key: itemKey(item.id), name: item.name, kind: soundOf(item) ? 'preset' : 'item', entry: item, children: [] })
  const top: Node[] = []
  const place = (node: Node, parent: RowKey | undefined) => (parent && nodes.get(parent) ? nodes.get(parent)!.children : top).push(node)
  for (const folder of folders) place(nodes.get(folderKey(folder.id))!, folder.parentId !== null && folderIds.has(folder.parentId) ? folderKey(folder.parentId) : undefined)
  for (const item of items) {
    const sound = soundOf(item)
    place(nodes.get(itemKey(item.id))!, sound ? itemKey(sound) : item.folderId !== null && folderIds.has(item.folderId) ? folderKey(item.folderId) : undefined)
  }
  // A folder in a cycle of parents is under no root; it isn't shown. Sorting goes depth first from the top.
  const sort = (list: Node[]) => { list.sort(byName); for (const node of list) sort(node.children) }
  sort(top)
  return top
}

/** The item rows in a subtree: its sounds, clips and samples, not the presets under a sound. */
const countItems = (nodes: readonly Node[]): number => nodes.reduce((sum, node) => sum + (node.kind === 'item' ? 1 : 0) + (node.kind === 'folder' ? countItems(node.children) : 0), 0)

/**
 * With a query or a kind, only the matches, the folders above them and a sound above a matching preset. A preset
 * matches on its own name or its sound's.
 */
const filterNodes = (nodes: readonly Node[], query: string, kind: string, sound?: Node): Node[] => {
  const matches = (node: Node) => {
    const item = node.entry as LibraryItem
    const names = [node.name, ...(sound ? [sound.name] : [])].map((name) => name.toLocaleLowerCase())
    return (!kind || item.content.kind === kind) && names.some((name) => name.includes(query))
  }
  const kept: Node[] = []
  for (const node of nodes) {
    const children = filterNodes(node.children, query, kind, node.kind === 'item' ? node : undefined)
    if (node.kind === 'folder' ? children.length > 0 : children.length > 0 || matches(node)) kept.push({ ...node, children })
  }
  return kept
}

/**
 * The rows the tree shows, depth first: *My library*, then the trash, each with what is under its expanded rows. With
 * a query or a kind, the matches and the rows above them, all expanded; the trash is searched only while it is open.
 */
export const libraryRows = (catalog: Pick<LibraryCatalog, 'folders' | 'items'>, { expanded, query = '', kind = '' }: RowOptions): LibraryRow[] => {
  const filtering = query.trim() !== '' || kind !== ''
  const needle = query.trim().toLocaleLowerCase()
  const rows: LibraryRow[] = []
  const visit = (node: Node, parent: RowKey, level: number, root: LibraryRoot) => {
    const isExpanded = node.children.length > 0 && (filtering || expanded.has(node.key))
    const base = { key: node.key, parent, level, name: node.name, root, hasChildren: node.children.length > 0, expanded: isExpanded }
    if (node.kind === 'folder') {
      const folder = node.entry as LibraryFolder
      rows.push({ ...base, kind: 'folder', id: folder.id, parentId: folder.parentId, count: node.children.filter((child) => child.kind === 'item').length })
    } else {
      const item = node.entry as LibraryItem
      if (node.kind === 'preset') rows.push({ ...base, kind: 'preset', id: item.id, assetId: (item.content as { assetId: string }).assetId })
      else rows.push({ ...base, kind: 'item', id: item.id, folderId: item.folderId, presets: node.children.length })
    }
    if (isExpanded) for (const child of node.children) visit(child, node.key, level + 1, root)
  }
  for (const root of ['mine', 'trash'] as const) {
    const all = nodesOf(catalog, root)
    const searched = filtering && (root === 'mine' || expanded.has(root))
    const shown = searched ? filterNodes(all, needle, kind) : all
    const isExpanded = shown.length > 0 && (expanded.has(root) || searched)
    rows.push({ kind: 'root', key: root, parent: null, level: 1, name: root === 'mine' ? 'My library' : 'Trash', root, count: countItems(shown), hasChildren: shown.length > 0, expanded: isExpanded })
    if (isExpanded) for (const node of shown) visit(node, root, 2, root)
  }
  return rows
}

/** The keys above a row, nearest first: its sound, its folders and its root. Empty for a root or a missing entry. */
export const ancestorsOf = (catalog: Pick<LibraryCatalog, 'folders' | 'items'>, key: RowKey): RowKey[] => {
  if (key === 'mine' || key === 'trash') return []
  const item = key.startsWith('i:') ? catalog.items.find((candidate) => candidate.id === key.slice(2)) : undefined
  const folder = key.startsWith('f:') ? catalog.folders.find((candidate) => candidate.id === key.slice(2)) : undefined
  const entry = item ?? folder
  if (!entry) return []
  const trashed = !!entry.trashed
  const ancestors: RowKey[] = []
  const live = (id: string | null) => catalog.folders.find((candidate) => candidate.id === id && !!candidate.trashed === trashed)
  let parent: string | null = folder ? folder.parentId : item!.folderId
  if (item && item.content.kind === 'preset') {
    const sound = catalog.items.find((candidate) => candidate.id === (item.content as { assetId: string }).assetId && !!candidate.trashed === trashed)
    if (sound) {
      ancestors.push(itemKey(sound.id))
      parent = sound.folderId
    }
  }
  while (parent !== null && live(parent) && !ancestors.includes(folderKey(parent))) {
    ancestors.push(folderKey(parent))
    parent = live(parent)!.parentId
  }
  ancestors.push(trashed ? 'trash' : 'mine')
  return ancestors
}

/** `expanded` with the rows above `key` expanded too, so it shows; the same set when they already are. */
export const expandedFor = (catalog: Pick<LibraryCatalog, 'folders' | 'items'>, expanded: ReadonlySet<RowKey>, key: RowKey): ReadonlySet<RowKey> => {
  const wanted = ancestorsOf(catalog, key)
  return wanted.every((ancestor) => expanded.has(ancestor)) ? expanded : new Set([...expanded, ...wanted])
}

/** What a key does in the tree (the WAI-ARIA tree view pattern): which row becomes active, and what expands. */
export interface TreeMove {
  readonly active?: RowKey
  readonly expanded?: ReadonlySet<RowKey>
}

/**
 * Arrow keys move the active row, Home and End to the first and last; Right expands a row or moves into it, Left
 * collapses it or moves to its parent, whatever the parent is; `*` expands the row's siblings. Undefined for other keys.
 */
export const treeKey = (rows: readonly LibraryRow[], active: RowKey | null, expanded: ReadonlySet<RowKey>, keyName: string): TreeMove | undefined => {
  const index = Math.max(0, rows.findIndex((row) => row.key === active))
  const row = rows[index]
  if (!row) return undefined
  const toggle = (key: RowKey, on: boolean) => {
    const next = new Set(expanded)
    if (on) next.add(key)
    else next.delete(key)
    return next
  }
  switch (keyName) {
    case 'ArrowDown': return { active: rows[Math.min(rows.length - 1, index + 1)]!.key }
    case 'ArrowUp': return { active: rows[Math.max(0, index - 1)]!.key }
    case 'Home': return { active: rows[0]!.key }
    case 'End': return { active: rows[rows.length - 1]!.key }
    case 'ArrowRight':
      if (!row.hasChildren) return {}
      return row.expanded ? { active: rows[index + 1]!.key } : { expanded: toggle(row.key, true) }
    case 'ArrowLeft':
      if (row.expanded) return { expanded: toggle(row.key, false) }
      return row.parent === null ? {} : { active: row.parent }
    case '*': {
      const next = new Set(expanded)
      for (const sibling of rows) if (sibling.parent === row.parent && sibling.hasChildren) next.add(sibling.key)
      return { expanded: next }
    }
    default: return undefined
  }
}
