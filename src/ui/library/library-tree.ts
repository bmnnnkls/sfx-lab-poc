import { type ControlOwner, type LibraryCatalog, type LibraryFolder, type LibraryItem, type Project, controlGraph, isFactoryId, trackRows } from '@core'
import { routingRefusalIn } from '@state'

/** The tree's roots: the open project (*This project*), the live library, the read-only Factory and the trash. */
export type LibraryRoot = 'project' | 'mine' | 'factory' | 'trash'

/** A row's key, unique in the tree and stable across renders: a root's name, `f:` a folder id, `i:` an item id. */
export type RowKey = string
export const folderKey = (id: string): RowKey => `f:${id}`
export const itemKey = (id: string): RowKey => `i:${id}`
/** Whether a key is *This project*'s root or a row under it (`p:`). */
export const isProjectKey = (key: RowKey): boolean => key === 'project' || key.startsWith('p:')

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

/** A graph of an owner, as *This project* names it: *Instrument*, *Effects* or *Notes*. */
export type GraphDomain = 'patch' | 'fx' | 'notes'

/**
 * What a row of *This project* is: an owner (a track, a group's bus, the master), one of its graphs, a project preset
 * under its graph, a heading (*Clips*, *Samples*, *Modules*), a session clip, a sample or a module.
 */
export type ProjectEntry =
  | { readonly kind: 'owner'; readonly owner: ControlOwner }
  | { readonly kind: 'graph'; readonly owner: ControlOwner; readonly domain: GraphDomain; readonly presets: number; readonly reason?: string }
  | { readonly kind: 'project-preset'; readonly presetId: string }
  | { readonly kind: 'heading'; readonly heading: 'clips' | 'samples' | 'modules' }
  | { readonly kind: 'clip'; readonly trackId: string; readonly clipId: string; readonly clipKind: 'midi-clip' | 'audio-clip' }
  | { readonly kind: 'sample'; readonly sampleId: string }
  | { readonly kind: 'module'; readonly moduleId: string }

/**
 * A row the tree shows. A preset shows under its sound (`preset`); one whose sound isn't beside it, trashed or gone,
 * shows as an item in its own folder. *This project*'s rows are `project` rows, carrying what they are (`entry`); a
 * heading counts the rows under it.
 */
export type LibraryRow =
  | (RowBase & { readonly kind: 'root'; readonly count: number })
  | (RowBase & { readonly kind: 'folder'; readonly id: string; readonly parentId: string | null; readonly count: number })
  | (RowBase & { readonly kind: 'item'; readonly id: string; readonly folderId: string | null; readonly presets: number })
  | (RowBase & { readonly kind: 'preset'; readonly id: string; readonly assetId: string })
  | (RowBase & { readonly kind: 'project'; readonly entry: ProjectEntry; readonly count: number })

export interface RowOptions {
  /** The keys of the expanded rows. */
  readonly expanded: ReadonlySet<RowKey>
  readonly query?: string
  /** An item kind (`instrument`, `midi-clip`, …), or empty for all. */
  readonly kind?: string
}

/** What the tree starts with: *My library* open, *This project* and the trash closed. */
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

/** What the Factory root is named while its catalog is loading: the row says so. */
export const FACTORY_LOADING = 'Loading Factory…'

/**
 * The rows the tree shows, depth first: *My library*, the Factory and the trash, each with what is under its expanded
 * rows. With a query or a kind, the matches and the rows above them, all expanded; the Factory and the trash are searched
 * only while they are open. `factory`: its catalog, null while it loads (the root says so), or undefined for no root.
 */
export const libraryRows = (catalog: Pick<LibraryCatalog, 'folders' | 'items'>, { expanded, query = '', kind = '' }: RowOptions, factory?: Pick<LibraryCatalog, 'folders' | 'items'> | null): LibraryRow[] => {
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
  const roots = factory === undefined ? (['mine', 'trash'] as const) : (['mine', 'factory', 'trash'] as const)
  for (const root of roots) {
    // The Factory's nodes are its live ones, as My library's are.
    const all = root === 'factory' ? (factory ? nodesOf(factory, 'mine') : []) : nodesOf(catalog, root)
    const searched = filtering && (root === 'mine' || expanded.has(root))
    const shown = searched ? filterNodes(all, needle, kind) : all
    const isExpanded = shown.length > 0 && (expanded.has(root) || searched)
    const name = root === 'mine' ? 'My library' : root === 'trash' ? 'Trash' : factory ? 'Factory' : FACTORY_LOADING
    rows.push({ kind: 'root', key: root, parent: null, level: 1, name, root, count: countItems(shown), hasChildren: shown.length > 0, expanded: isExpanded })
    if (isExpanded) for (const node of shown) visit(node, root, 2, root)
  }
  return rows
}

// ---- This project

/** A row of *This project* before filtering: what it is, what search and the type filter match, and what is under it. */
interface ProjectNode {
  readonly key: RowKey
  readonly name: string
  readonly entry: ProjectEntry
  /** The type filter's kind it is (`instrument`, `midi-clip`, …); none for an owner, a heading or a module. */
  readonly kind?: string
  /** It matches only through the rows under it: an owner or a heading. */
  readonly container: boolean
  readonly children: readonly ProjectNode[]
}

/** The rows of *This project* for one state of the project: its name and its top rows. */
export interface ProjectModel {
  readonly name: string
  readonly nodes: readonly ProjectNode[]
}

/** The nodes a graph starts and ends with; a graph of only these holds nothing. */
const ENDPOINTS: ReadonlySet<string> = new Set(['trackIn', 'returnIn', 'groupIn', 'masterIn', 'trackOut', 'clipNotes', 'noteOut'])
const GRAPH_NAMES: Readonly<Record<GraphDomain, string>> = { patch: 'Instrument', fx: 'Effects', notes: 'Notes' }
const GRAPH_KINDS: Readonly<Record<GraphDomain, string>> = { patch: 'instrument', fx: 'audio-effect', notes: 'note-effect' }

/** A key for an owner: `t:` a track's id, `g:` a group's, `m` the master. */
const ownerPart = (owner: ControlOwner) => (owner.kind === 'track' ? `t:${owner.trackId}` : owner.kind === 'group' ? `g:${owner.groupId}` : 'm')
export const projectOwnerKey = (owner: ControlOwner): RowKey => `p:${ownerPart(owner)}`
export const projectGraphKey = (owner: ControlOwner, domain: GraphDomain): RowKey => `p:${ownerPart(owner)}/${domain}`
const sameOwner = (a: ControlOwner, b: ControlOwner) => ownerPart(a) === ownerPart(b)

const leaf = (key: RowKey, name: string, entry: ProjectEntry, kind?: string): ProjectNode => ({ key, name, entry, ...(kind && { kind }), container: false, children: [] })
const heading = (key: RowKey, name: string, which: 'clips' | 'samples' | 'modules', children: readonly ProjectNode[]): ProjectNode => ({ key, name, entry: { kind: 'heading', heading: which }, container: true, children })

/** The rows under an owner: its graphs that hold something (or have presets), each with its presets, then its clips. */
const ownerNode = (project: Project, owner: ControlOwner, name: string, domains: readonly GraphDomain[], clips: ProjectNode[]): ProjectNode => {
  const graphs = domains.flatMap((domain): ProjectNode[] => {
    const graph = controlGraph(project, owner, domain)
    const presets = (project.presets ?? []).filter((preset) => preset.scope.domain === domain && sameOwner(preset.scope.owner, owner))
    if (!graph || (!graph.nodes.some((node) => !ENDPOINTS.has(node.type)) && presets.length === 0)) return []
    const reason = routingRefusalIn(project, { owner, domain })
    return [{
      key: projectGraphKey(owner, domain),
      name: GRAPH_NAMES[domain],
      entry: { kind: 'graph', owner, domain, presets: presets.length, ...(reason && { reason }) },
      kind: GRAPH_KINDS[domain],
      container: false,
      children: presets.map((preset) => leaf(`p:s:${preset.id}`, preset.name, { kind: 'project-preset', presetId: preset.id }, 'preset')),
    }]
  })
  const key = projectOwnerKey(owner)
  return { key, name, entry: { kind: 'owner', owner }, container: true, children: clips.length > 0 ? [...graphs, heading(`${key}/clips`, 'Clips', 'clips', clips)] : graphs }
}

/**
 * *This project*'s rows: each clip track in Tracks order, then the returns, the group buses and the master, each with
 * its graphs and clips; then the project's samples and modules. Nothing is captured: names, counts and a node-type scan
 * for the ⚠ reason.
 */
const buildProjectModel = (project: Project): ProjectModel => {
  const nodes: ProjectNode[] = []
  const tracks = (kind: 'clips' | 'returns') => project.tracks.filter((track) => (track.kind === 'return') === (kind === 'returns'))
  for (const track of [...tracks('clips'), ...tracks('returns')]) {
    const owner: ControlOwner = { kind: 'track', trackId: track.id }
    const clipKind = track.kind === 'instrument' ? 'midi-clip' : 'audio-clip'
    const clips = track.kind === 'return' ? [] : track.clips.flatMap((clip) => (clip ? [leaf(`p:c:${clip.id}`, clip.name || 'Clip', { kind: 'clip', trackId: track.id, clipId: clip.id, clipKind }, clipKind)] : []))
    nodes.push(ownerNode(project, owner, track.name, track.kind === 'instrument' ? ['patch', 'fx', 'notes'] : ['fx'], clips))
  }
  for (const row of trackRows(project)) if (row.kind === 'group' && row.group.bus) nodes.push(ownerNode(project, { kind: 'group', groupId: row.group.id }, `${row.group.name} bus`, ['fx'], []))
  nodes.push(ownerNode(project, { kind: 'master' }, 'Master', ['fx'], []))
  if (project.samples.length > 0) nodes.push(heading('p:samples', 'Samples', 'samples', project.samples.map((sample) => leaf(`p:a:${sample.id}`, sample.name, { kind: 'sample', sampleId: sample.id }, 'sample'))))
  if (project.modules.length > 0) nodes.push(heading('p:modules', 'Modules', 'modules', project.modules.map((module) => leaf(`p:o:${module.id}`, module.name, { kind: 'module', moduleId: module.id }))))
  return { name: project.name, nodes }
}

const models = new WeakMap<Project, ProjectModel>()
let lastModel: { readonly signature: string; readonly model: ProjectModel } | undefined

/**
 * *This project*'s rows for a state of the project, memoized on the project object. A new project whose rows are the
 * same as the last one's (an edit that changed only a value, a knob dragged) gets the same model back, so a view that
 * selects it doesn't re-render.
 */
export const projectModel = (project: Project): ProjectModel => {
  const known = models.get(project)
  if (known) return known
  const built = buildProjectModel(project)
  const signature = JSON.stringify(built)
  const model = lastModel?.signature === signature ? lastModel.model : built
  lastModel = { signature, model }
  models.set(project, model)
  return model
}

/** The row of *This project* with `key`, and the rows above it, nearest first; undefined when it is gone. */
export const projectNodeOf = (model: ProjectModel, key: RowKey): { readonly node: ProjectNode; readonly above: readonly ProjectNode[] } | undefined => {
  const find = (nodes: readonly ProjectNode[], above: readonly ProjectNode[]): { node: ProjectNode; above: readonly ProjectNode[] } | undefined => {
    for (const node of nodes) {
      if (node.key === key) return { node, above }
      const found = find(node.children, [node, ...above])
      if (found) return found
    }
    return undefined
  }
  return find(model.nodes, [])
}

/**
 * With a query or a kind, only the matches and the rows above them. An owner's name is matched by the rows under it
 * (a search for *Bass* shows Bass's graphs, presets and clips), a heading's never; modules match search only.
 */
const filterProject = (nodes: readonly ProjectNode[], query: string, kind: string, inherited: readonly string[] = []): ProjectNode[] => {
  const kept: ProjectNode[] = []
  for (const node of nodes) {
    const names = node.entry.kind === 'owner' ? [...inherited, node.name] : inherited
    const children = filterProject(node.children, query, kind, names)
    const matches = !node.container && (!kind || node.kind === kind) && [node.name, ...names].some((name) => name.toLocaleLowerCase().includes(query))
    if (children.length > 0 || matches) kept.push({ ...node, children })
  }
  return kept
}

/**
 * *This project*'s rows, depth first: its root, named after the project, and what is under its expanded rows. With a
 * query or a kind, the matches and the rows above them, all expanded, while the root is open (as the trash is searched).
 */
export const projectRows = (model: ProjectModel, { expanded, query = '', kind = '' }: RowOptions): LibraryRow[] => {
  const filtering = query.trim() !== '' || kind !== ''
  const searched = filtering && expanded.has('project')
  const shown = searched ? filterProject(model.nodes, query.trim().toLocaleLowerCase(), kind) : model.nodes
  const isExpanded = shown.length > 0 && expanded.has('project')
  const rows: LibraryRow[] = [{ kind: 'root', key: 'project', parent: null, level: 1, name: model.name, root: 'project', count: 0, hasChildren: shown.length > 0, expanded: isExpanded }]
  const visit = (node: ProjectNode, parent: RowKey, level: number) => {
    const open = node.children.length > 0 && (searched || expanded.has(node.key))
    // A heading counts its rows, a graph its presets.
    const count = node.entry.kind === 'heading' || node.entry.kind === 'graph' ? node.children.length : 0
    rows.push({ kind: 'project', key: node.key, parent, level, name: node.name, root: 'project', hasChildren: node.children.length > 0, expanded: open, entry: node.entry, count })
    if (open) for (const child of node.children) visit(child, node.key, level + 1)
  }
  if (isExpanded) for (const node of shown) visit(node, 'project', 2)
  return rows
}

/**
 * The keys above a row, nearest first: its sound, its folders and its root. Empty for a root or a missing entry. A
 * Factory row's are read in `factory`.
 */
export const ancestorsOf = (personal: Pick<LibraryCatalog, 'folders' | 'items'>, key: RowKey, factory?: Pick<LibraryCatalog, 'folders' | 'items'> | null): RowKey[] => {
  if (key === 'mine' || key === 'trash' || key === 'factory') return []
  const inFactory = (key.startsWith('i:') || key.startsWith('f:')) && isFactoryId(key.slice(2))
  const catalog = inFactory ? (factory ?? { folders: [], items: [] }) : personal
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
  ancestors.push(inFactory ? 'factory' : trashed ? 'trash' : 'mine')
  return ancestors
}

/** `expanded` with the rows above `key` expanded too, so it shows; the same set when they already are. */
export const expandedFor = (catalog: Pick<LibraryCatalog, 'folders' | 'items'>, expanded: ReadonlySet<RowKey>, key: RowKey, factory?: Pick<LibraryCatalog, 'folders' | 'items'> | null): ReadonlySet<RowKey> => {
  const wanted = ancestorsOf(catalog, key, factory)
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
