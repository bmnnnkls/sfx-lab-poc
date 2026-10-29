import { createId } from '../shared'
import { resolveControlTarget } from '../control'
import { canonicalPortableSignature, canonicalRecord, validateLibraryPayloads } from '../persistence'
import { createEmptyProject, createGroupBus } from '../project'
import { insertLibraryAsset } from './assets'
import { libraryName } from './catalog'
import { LIBRARY_CATALOG_VERSION, type LibraryCatalog, type LibraryItem } from './types'

export const LIBRARY_BUNDLE_VERSION = 2
export interface LibraryBundleManifest {
  readonly format: 'sfx-lab-library'
  readonly version: 2
  readonly name: string
  readonly partial: boolean
  readonly missing: readonly string[]
  readonly catalog: LibraryCatalog
}
export interface LibraryBundleSelection { readonly itemIds?: readonly string[]; readonly folderIds?: readonly string[] }
const fail = (reason: string): never => { throw new Error(`Invalid library bundle: ${reason}`) }
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const keys = (value: object, allowed: string[]) => { if (Object.keys(value).some(k => !allowed.includes(k))) fail('unknown fields') }
const list = (value: unknown, max: number): unknown[] => { if (!Array.isArray(value) || value.length > max) return fail(`collection limit (${max})`); return value }
const unique = (values: readonly { readonly id: string }[]) => { if (new Set(values.map(v => v.id)).size !== values.length || values.some(v => !id(v.id))) fail('duplicate or invalid IDs') }
const byId = <T extends { readonly id: string }>(values: readonly T[]): T[] => [...values].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** Bounds every nested record before graph parsers/flattening allocate derived structures. */
export const validateBundleObjectBudget = (root: unknown): void => {
  let objects = 0, values = 0
  const visit = (value: unknown, depth: number) => {
    if (++values > 300000) fail('value count limit (300000)')
    if (depth > 64) fail('object depth limit (64)')
    if (typeof value === 'string' && value.length > 1024 * 1024) fail('string limit')
    if (typeof value === 'number' && !Number.isFinite(value)) fail('non-finite number')
    if (value && typeof value === 'object') {
      if (++objects > 100000) fail('object count limit (100000)')
      if (Array.isArray(value) && value.length > 100000) fail('object count/array limit (100000)')
      for (const [key, child] of Object.entries(value)) {
        if ((key === 'id' || key.endsWith('Id') || ['node', 'port', 'param'].includes(key)) && typeof child === 'string' && !id(child)) fail('ID length limit (256)')
        if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('unsafe object key')
        visit(child, depth + 1)
      }
    }
  }
  visit(root, 0)
}

/** Validate closure references before the project record validators. No silent sanitizing or dropped records. */
export const validateLibraryCatalog = (input: unknown): LibraryCatalog => {
  validateBundleObjectBudget(input)
  if (!record(input) || input.version !== LIBRARY_CATALOG_VERSION) return fail('unsupported catalog version')
  keys(input, ['version', 'folders', 'items', 'revisions', 'samples'])
  const folders = list(input.folders, 1024), items = list(input.items, 4096), revisions = list(input.revisions, 4096), samples = list(input.samples, 4096)
  if ([...folders, ...items, ...revisions, ...samples].some(v => !record(v) || !id(v.id))) return fail('malformed records')
  const c = input as unknown as LibraryCatalog
  unique(c.folders); unique(c.items); unique(c.revisions); unique(c.samples)
  const folderById = new Map(c.folders.map(f => [f.id, f]))
  const itemById = new Map(c.items.map(i => [i.id, i]))
  const revisionById = new Map(c.revisions.map(r => [r.id, r]))
  const sampleIds = new Set(c.samples.map(s => s.id))
  for (const f of c.folders) {
    keys(f, ['id', 'name', 'parentId'])
    if (typeof f.name !== 'string' || libraryName(f.name) !== f.name || !(f.parentId === null || id(f.parentId))) fail('folder fields')
  }
  // Iterative, memoized ancestry: each edge is visited once, including a legal 1024-folder chain.
  const ancestorsValidated = new Set<string>()
  for (const f of c.folders) {
    const path = new Set<string>()
    let parent: string | null = f.id
    while (parent !== null && !ancestorsValidated.has(parent)) {
      if (path.has(parent)) fail('folder cycle')
      path.add(parent)
      const folder = folderById.get(parent)
      if (!folder) fail('missing folder')
      parent = folder!.parentId
    }
    for (const id of path) ancestorsValidated.add(id)
  }
  for (const revision of c.revisions) {
    if (!record(revision.payload) || !['instrument', 'audio-effect', 'note-effect'].includes(revision.payload.kind)) fail('revision payload')
    const p = revision.payload
    list(p.modules, 128); list(p.sampleIds, 256)
    if (p.sampleIds.some(s => !sampleIds.has(s))) fail('missing sample metadata')
    const graphs = [...(p.kind === 'instrument' ? [p.patch, p.noteGraph] : [p.graph]), ...p.modules.map(m => m.patch)]
    unique(p.modules)
    const moduleById = new Map(p.modules.map(m => [m.id, m]))
    const dependencySamples = new Set(p.sampleIds)
    let flatNodes = 0
    const visitGraph = (graph: typeof graphs[number], seen: Set<string>, depth: number): void => {
      if (depth > 16 || !record(graph)) fail('module depth limit (16) or invalid graph')
      list(graph.nodes, 200); list(graph.connections, 40000)
      for (const node of graph.nodes) {
        if (++flatNodes > 10000) fail('expanded module node limit (10000)')
        if (!record(node)) fail('invalid graph node')
        if (['send', 'trackAudio', 'trackNotes'].includes(node.type)) fail('external routing')
        if (node.sampleId && !dependencySamples.has(node.sampleId)) fail('sample absent from dependency closure')
        if (node.type === 'module') {
          const m = moduleById.get(node.moduleId ?? '')
          if (!m) fail('missing module dependency')
          if (seen.has(m!.id)) fail('module dependency cycle')
          visitGraph(m!.patch, new Set([...seen, m!.id]), depth + 1)
        }
      }
    }
    // Include unused definitions too: malformed dependencies cannot hide in a revision.
    for (const graph of graphs) visitGraph(graph, new Set(), 0)
  }
  for (const item of c.items) {
    keys(item, ['id', 'name', 'folderId', 'content'])
    if (typeof item.name !== 'string' || libraryName(item.name) !== item.name || !(item.folderId === null || folderById.has(item.folderId)) || !record(item.content)) fail('item fields or folder')
    const content = item.content
    if ('revisionId' in content) {
      keys(content, content.kind === 'preset' ? ['kind', 'revisionId', 'assetId', 'state'] : ['kind', 'revisionId', 'state'])
      const revision = revisionById.get(content.revisionId)
      if (!revision || !record(content.state) || content.state.revisionId !== revision.id || !Array.isArray(content.state.samples)) fail('missing/mismatched revision')
      if (content.kind === 'preset') {
        const asset = itemById.get(content.assetId)
        if (!asset || !['instrument', 'audio-effect', 'note-effect'].includes(asset.content.kind) || !('revisionId' in asset.content) || asset.content.revisionId !== content.revisionId) fail('preset asset dependency or cycle')
      } else if (content.kind !== revision!.payload.kind) fail('asset kind mismatch')
      if (content.state.samples.some(b => b.sampleId !== null && !revision!.payload.sampleIds.includes(b.sampleId))) fail('preset sample absent from closure')
    } else if (content.kind === 'sample') {
      keys(content, ['kind', 'sampleId'])
      if (!sampleIds.has(content.sampleId)) fail('missing sample metadata')
    } else if (content.kind === 'midi-clip' || content.kind === 'audio-clip') {
      keys(content, ['kind', 'clip', 'lanes'])
      if (!record(content.clip)) fail('clip fields')
      list(content.lanes, 64)
      for (const lane of content.lanes) {
        if (!record(lane) || !record(lane.target)) fail('lane fields')
        keys(lane, ['id', 'target', 'points', 'enabled', 'graphSignature', 'nodeIndex'])
        if ('owner' in lane.target || lane.target.kind === 'mixer' && lane.target.control === 'send' || lane.target.kind === 'graph' && (['send', 'trackAudio', 'trackNotes'].includes(lane.target.nodeType) || typeof lane.graphSignature !== 'string' || !Number.isInteger(lane.nodeIndex) || lane.nodeIndex! < 0 || lane.nodeIndex! >= 10000)) fail('unsafe portable lane')
        if (lane.target.kind === 'graph') {
          const signature = canonicalPortableSignature(lane.graphSignature)
          const nodes = JSON.parse(signature)[0] as unknown[][]
          if (signature !== lane.graphSignature || nodes[lane.nodeIndex!]?.[0] !== lane.target.nodeType) fail('noncanonical or mismatched portable signature')
        }
      }
    } else fail('unknown item kind')
  }
  const usedRevisions = new Set(c.items.flatMap(i => 'revisionId' in i.content ? [i.content.revisionId] : []))
  const usedSamples = new Set([...c.revisions.flatMap(r => r.payload.sampleIds), ...c.items.flatMap(i => i.content.kind === 'sample' ? [i.content.sampleId] : i.content.kind === 'audio-clip' ? [i.content.clip.sampleId] : [])])
  if (c.revisions.some(r => !usedRevisions.has(r.id)) || c.samples.some(s => !usedSamples.has(s.id))) fail('unreferenced dependency records')
  validateLibraryPayloads(c)
  // Guard target paths/types/scopes against actual immutable graphs, without using the live engine.
  const validatedSounds = new Set<string>()
  for (const item of c.items) if ('revisionId' in item.content) {
    // Only identical sound/owner data may share this check. Strict field sanitation above still runs per record.
    const sound = canonicalRecord([item.content.revisionId, item.content.state.scope, item.content.state.values, item.content.state.samples])
    if (validatedSounds.has(sound)) continue
    const revision = revisionById.get(item.content.revisionId)!
    const owner = item.content.state.scope.owner
    const p = createEmptyProject(), track = p.tracks[0]!
    const sourceInput = revision.payload.kind === 'audio-effect' ? [revision.payload.graph, ...revision.payload.modules.map(m => m.patch)].flatMap(g => g.nodes).find(n => ['masterIn', 'returnIn', 'trackIn', 'groupIn'].includes(n.type))?.type : undefined
    const project = owner.kind === 'master' ? p
      : owner.kind === 'group' ? { ...p, tracks: [{ ...track, groupId: owner.groupId }], groups: [{ id: owner.groupId, name: 'Group', colour: 'red' as const, bus: createGroupBus() }] }
      : { ...p, tracks: [{ ...track, id: owner.trackId, ...(sourceInput === 'returnIn' && { kind: 'return' as const }) }] }
    // Test each sound in isolation so a large catalog isn't constrained by project preset count (128).
    const isolated = { ...c, items: [item] }
    const inserted = insertLibraryAsset(project, isolated, item, revision.payload.kind === 'instrument' ? { mode: 'new-track' } : { mode: 'replace', scope: { owner, domain: revision.payload.kind === 'note-effect' ? 'notes' : 'fx' } }).project
    for (const value of inserted.presets?.[0]?.values ?? []) {
      const resolved = resolveControlTarget(inserted, value.target)
      if (resolved.status !== 'available' || resolved.baseValue !== value.value) fail('preset control value requires repair')
    }
    validatedSounds.add(sound)
  }
  return c
}

/** A selection includes all associated sounds, their asset, immutable revision and ancestor paths. */
export const selectLibraryBundle = (catalog: LibraryCatalog, selection: LibraryBundleSelection): LibraryCatalog => {
  const folderById = new Map(catalog.folders.filter(f => !f.trashed).map(f => [f.id, f]))
  const itemById = new Map(catalog.items.filter(i => !i.trashed).map(i => [i.id, i]))
  const children = new Map<string, string[]>()
  for (const f of folderById.values()) if (f.parentId !== null) children.set(f.parentId, [...(children.get(f.parentId) ?? []), f.id])
  const folders = new Set<string>(), ids = new Set(selection.itemIds ?? [])
  const visiting = new Set<string>()
  const visit = (id: string) => {
    if (visiting.has(id)) fail('folder cycle')
    if (folders.has(id)) return
    visiting.add(id)
    const f = folderById.get(id); if (!f) fail('selected folder unavailable')
    folders.add(id)
    for (const child of children.get(id) ?? []) visit(child)
    visiting.delete(id)
  }
  for (const id of selection.folderIds ?? []) if (!folders.has(id)) visit(id)
  for (const item of catalog.items) if (!item.trashed && item.folderId && folders.has(item.folderId)) ids.add(item.id)
  let changed = true
  while (changed) {
    changed = false
    for (const item of catalog.items) if (!item.trashed && item.content.kind === 'preset' && (ids.has(item.id) || ids.has(item.content.assetId))) {
      for (const id of [item.id, item.content.assetId]) if (!ids.has(id)) { ids.add(id); changed = true }
    }
  }
  const items = [...ids].map(id => { const item = itemById.get(id); if (!item) return fail('selected/dependent item unavailable'); return item })
  const ancestorsAdded = new Set<string>()
  for (const parentId of [...folders, ...items.flatMap(i => i.folderId === null ? [] : [i.folderId])]) {
    let parent: string | null = parentId; const seen = new Set<string>()
    while (parent !== null && !ancestorsAdded.has(parent)) { if (seen.has(parent)) fail('folder cycle'); seen.add(parent); folders.add(parent); const f = folderById.get(parent); if (!f) fail('missing parent folder'); parent = f!.parentId }
    for (const id of seen) ancestorsAdded.add(id)
  }
  const revisionIds = new Set(items.flatMap(i => 'revisionId' in i.content ? [i.content.revisionId] : []))
  const revisions = catalog.revisions.filter(r => revisionIds.has(r.id))
  if (revisions.length !== revisionIds.size) fail('missing immutable revision')
  const sampleIds = new Set([...revisions.flatMap(r => r.payload.sampleIds), ...items.flatMap(i => i.content.kind === 'sample' ? [i.content.sampleId] : i.content.kind === 'audio-clip' ? [i.content.clip.sampleId] : [])])
  const clean = <T extends { readonly trashed?: boolean }>(v: T): Omit<T, 'trashed'> => { const { trashed: _trash, ...rest } = v; return rest }
  return validateLibraryCatalog({ version: LIBRARY_CATALOG_VERSION, folders: byId(catalog.folders.filter(f => folders.has(f.id)).map(clean)), items: byId(items.map(clean)), revisions: byId(revisions), samples: byId(catalog.samples.filter(s => sampleIds.has(s.id))) })
}

export const libraryBundleConflicts = (current: LibraryCatalog, incoming: LibraryCatalog): number =>
  incoming.folders.filter(f => current.folders.some(v => v.id === f.id)).length + incoming.items.filter(i => current.items.some(v => v.id === i.id)).length + incoming.revisions.filter(r => current.revisions.some(v => v.id === r.id)).length

/** Every import is an independent copy under a fresh root, even on repeat; hashes alone deduplicate. */
export const mergeLibraryBundle = (current: LibraryCatalog, incoming: LibraryCatalog, name: string): LibraryCatalog => {
  if (current.folders.length + incoming.folders.length + 1 > 1024 || current.items.length + incoming.items.length > 4096) fail('destination catalog capacity exceeded')
  for (const sample of incoming.samples) {
    const existing = current.samples.find(s => s.id === sample.id)
    // Display names/extensions can differ for the same bytes. Decoded properties must agree.
    if (existing && ['bytes', 'sampleRate', 'channels', 'durationSeconds'].some(k => existing[k as keyof typeof sample] !== sample[k as keyof typeof sample])) fail('conflicting sample metadata')
  }
  const root = createId('folder'), folders = new Map(incoming.folders.map(f => [f.id, createId('folder')])), items = new Map(incoming.items.map(i => [i.id, createId('item')])), revisions = new Map(incoming.revisions.map(r => [r.id, createId('revision')]))
  const state = (s: Extract<LibraryItem['content'], { state: unknown }>['state']) => ({ ...s, id: createId('preset'), revisionId: revisions.get(s.revisionId)! })
  return { version: LIBRARY_CATALOG_VERSION,
    folders: [...current.folders, { id: root, name: libraryName(name), parentId: null }, ...incoming.folders.map(f => ({ ...f, id: folders.get(f.id)!, parentId: f.parentId === null ? root : folders.get(f.parentId)! }))],
    items: [...current.items, ...incoming.items.map(i => ({ ...i, id: items.get(i.id)!, folderId: i.folderId === null ? root : folders.get(i.folderId)!, content: 'revisionId' in i.content ? { ...i.content, revisionId: revisions.get(i.content.revisionId)!, state: state(i.content.state), ...(i.content.kind === 'preset' && { assetId: items.get(i.content.assetId)! }) } : i.content }))],
    revisions: [...current.revisions, ...incoming.revisions.map(r => ({ ...r, id: revisions.get(r.id)! }))],
    samples: [...current.samples, ...incoming.samples.filter(s => !current.samples.some(v => v.id === s.id))],
  }
}

export interface LibraryBundleStage {
  readonly manifest: LibraryBundleManifest
  readonly blobs: ReadonlyMap<string, Uint8Array>
  readonly expandedBytes: number
  readonly missing: readonly string[]
}
