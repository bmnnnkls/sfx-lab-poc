import { type ControlOwner, type ControlTarget, editControlBase } from '../control'
import { type Patch, type ModuleDefinition } from '../patch'
import { EXTERNAL_ROUTING, assetSignature, saveProjectPreset, editSampleBinding, resolveSampleTarget, type AssetPayload, type ProjectPreset, type SampleTarget, type SnapshotScope } from '../preset'
import { type Project, createTrack } from '../project'
import { createId } from '../shared'
import { saveLibraryItem } from './catalog'
import { insertedOrigin } from './link'
import type { LibraryCatalog, LibraryItem } from './types'

/** Save the current authored state plus every compatible embedded preset, not unrelated owners' sounds. */
export const captureLibraryAsset = (catalog: LibraryCatalog, project: Project, scope: SnapshotScope, name: string, folderId: string | null): LibraryCatalog => {
  const captured = saveProjectPreset({ ...project, presets: [], assetRevisions: [] }, scope, name)
  const state = captured.presets![0]!, revision = captured.assetRevisions![0]!, id = createId('item')
  const presets = (project.presets ?? []).filter(p => p.scope.domain === scope.domain && JSON.stringify(p.scope.owner) === JSON.stringify(scope.owner) && project.assetRevisions?.find(r => r.id === p.revisionId)?.signature === revision.signature)
  const sampleIds = new Set([...revision.payload.sampleIds, ...state.samples.flatMap(s => s.sampleId ? [s.sampleId] : []), ...presets.flatMap(p => p.samples.flatMap(s => s.sampleId ? [s.sampleId] : []))])
  const missing = [...sampleIds].filter(id => !project.samples.some(s => s.id === id))
  if (missing.length) throw new Error(`Missing sample metadata: ${missing.join(', ')}`)
  const complete = { ...revision, payload: { ...revision.payload, sampleIds: [...sampleIds] } }
  let next: LibraryCatalog = { ...catalog, revisions: [...catalog.revisions, complete], samples: [...catalog.samples, ...project.samples.filter(s => sampleIds.has(s.id) && !catalog.samples.some(known => known.id === s.id))] }
  next = saveLibraryItem(next, { id, name, folderId, content: { kind: revision.payload.kind, revisionId: revision.id, state } })
  for (const preset of presets) next = saveLibraryItem(next, { id: createId('item'), name: preset.name, folderId, content: { kind: 'preset', assetId: id, revisionId: revision.id, state: { ...preset, revisionId: revision.id } } })
  return next
}

/** The graphs of a revision's payload, its modules' included. */
const payloadGraphs = (payload: AssetPayload): readonly Patch[] =>
  [...(payload.kind === 'instrument' ? [payload.patch, payload.noteGraph] : [payload.graph]), ...payload.modules.map(m => m.patch)]

/**
 * Save one project preset on its own: a new library sound built from the preset's own revision, whose state is the
 * preset, with no other presets. It never reads the current graph, so it works after the preset's owner was rewired.
 */
export const captureLibraryPreset = (catalog: LibraryCatalog, project: Project, presetId: string, folderId: string | null): LibraryCatalog => {
  const preset = project.presets?.find(p => p.id === presetId)
  if (!preset) throw new Error('The preset is no longer in the project')
  const revision = project.assetRevisions?.find(r => r.id === preset.revisionId)
  if (!revision) throw new Error('The preset has lost its revision')
  if (payloadGraphs(revision.payload).some(graph => graph.nodes.some(node => EXTERNAL_ROUTING.includes(node.type)))) throw new Error('Presets require graphs without external track routing')
  const sampleIds = new Set([...revision.payload.sampleIds, ...preset.samples.flatMap(s => s.sampleId ? [s.sampleId] : [])])
  const missing = [...sampleIds].filter(id => !project.samples.some(s => s.id === id))
  if (missing.length) throw new Error(`Missing sample metadata: ${missing.join(', ')}`)
  // A fresh id, as every capture's: the project's revision id may already be in the catalog from an earlier save.
  const stored = { ...revision, id: createId('revision'), payload: { ...revision.payload, sampleIds: [...sampleIds] } }
  const next: LibraryCatalog = { ...catalog, revisions: [...catalog.revisions, stored], samples: [...catalog.samples, ...project.samples.filter(s => sampleIds.has(s.id) && !catalog.samples.some(known => known.id === s.id))] }
  return saveLibraryItem(next, { id: createId('item'), name: preset.name, folderId, content: { kind: revision.payload.kind, revisionId: stored.id, state: { ...preset, revisionId: stored.id } } })
}

/** Remap the closure, including derived interface/knob IDs and every reference to those IDs. */
/** The start nodes of insert graphs: an effect made from one fits only an owner that starts there. */
export const EFFECT_INPUTS: readonly string[] = ['masterIn', 'returnIn', 'trackIn', 'groupIn']

const copyAsset = (payload: AssetPayload, owner: ControlOwner) => {
  const nodes = new Map<string, string>(), modules = new Map(payload.modules.map(m => [m.id, createId('module')]))
  const graphs = payload.kind === 'instrument' ? [payload.patch, payload.noteGraph] : [payload.graph]
  for (const graph of [...graphs, ...payload.modules.map(m => m.patch)]) for (const node of graph.nodes) if (!nodes.has(node.id)) nodes.set(node.id, createId('node'))
  const nodeId = (id: string) => nodes.get(id) ?? id
  const copies = new Map<string, ModuleDefinition>(), visiting = new Set<string>()
  const parameter = (moduleId: string | undefined, key: string): string => {
    const original = payload.modules.find(m => m.id === moduleId)
    if (!original) return key
    const copied = module(original.id), knobIndex = original.knobs.findIndex(k => k.id === key)
    if (knobIndex >= 0) return copied.knobs[knobIndex]!.id
    const control = original.patch.nodes.find(n => key.startsWith(`${n.id}:`))
    return control ? `${nodeId(control.id)}${key.slice(control.id.length)}` : key
  }
  const port = (moduleId: string | undefined, key: string): string => {
    if (key.startsWith('param:')) return `param:${parameter(moduleId, key.slice(6))}`
    const original = payload.modules.find(m => m.id === moduleId)
    if (!original) return key
    const copied = module(original.id)
    for (const direction of ['inputs', 'outputs'] as const) {
      const index = original[direction].findIndex(p => p.id === key)
      if (index >= 0) return copied[direction][index]!.id
    }
    return key
  }
  const ref = (graph: Patch, r: { node: string; port: string }) => ({ node: nodeId(r.node), port: port(graph.nodes.find(n => n.id === r.node)?.moduleId, r.port) })
  const patch = (graph: Patch): Patch => ({
    nodes: graph.nodes.map(n => ({ ...n, id: nodeId(n.id), ...(n.moduleId && { moduleId: modules.get(n.moduleId) ?? n.moduleId }), params: Object.fromEntries(Object.entries(n.params).map(([key, value]) => [n.type === 'module' ? parameter(n.moduleId, key) : key, value])) })),
    connections: graph.connections.map(c => ({ id: createId('wire'), from: ref(graph, c.from), to: ref(graph, c.to) })),
  })
  const module = (id: string): ModuleDefinition => {
    const known = copies.get(id)
    if (known) return known
    if (visiting.has(id)) throw new Error('Cyclic module dependency')
    const original = payload.modules.find(m => m.id === id)
    if (!original) throw new Error('Module dependency is missing')
    visiting.add(id)
    const ports = (direction: 'inputs' | 'outputs') => original[direction].map(p => { const inner = ref(original.patch, p.inner); return { ...p, id: `${inner.node}:${inner.port}`, inner } })
    const copied = { ...original, id: modules.get(id)!, patch: patch(original.patch), inputs: ports('inputs'), outputs: ports('outputs'), knobs: original.knobs.map(k => {
      const param = parameter(original.patch.nodes.find(n => n.id === k.node)?.moduleId, k.param), node = nodeId(k.node)
      return { ...k, id: `${node}:${param}`, node, param }
    }) }
    copies.set(id, copied); visiting.delete(id)
    return copied
  }
  const library = payload.modules.map(m => module(m.id))
  const target = <T extends ControlTarget | SampleTarget>(t: T): T => ({ ...t, owner, ...(t.kind === 'graph' && { nodeId: nodeId(t.nodeId), path: t.path.map(s => ({ nodeId: nodeId(s.nodeId), moduleId: modules.get(s.moduleId) ?? s.moduleId })) }) })
  const copied: AssetPayload = payload.kind === 'instrument' ? { ...payload, modules: library, patch: patch(payload.patch), noteGraph: patch(payload.noteGraph) } : { ...payload, modules: library, graph: patch(payload.graph) }
  return { payload: copied, target, nodes, modules }
}

/**
 * Where an insert goes. `carry`: the scope of this project the item was captured from (a project graph copied to
 * another owner), whose library link the copy carries, composed with the copy's maps, in place of a link to the
 * throwaway item.
 */
export interface AssetDestination { readonly mode: 'new-track' | 'replace'; readonly scope?: SnapshotScope; readonly carry?: SnapshotScope }
export const insertLibraryAsset = (project: Project, catalog: LibraryCatalog, item: LibraryItem, destination: AssetDestination): { project: Project; scope: SnapshotScope } => {
  const content = item.content
  if (!('revisionId' in content)) throw new Error('Choose an instrument, effect or preset')
  const original = catalog.revisions.find(r => r.id === content.revisionId)
  if (!original) throw new Error('Asset revision is missing')
  const graphs = original.payload.kind === 'instrument' ? [original.payload.patch, original.payload.noteGraph] : [original.payload.graph]
  if ([...graphs, ...original.payload.modules.map(m => m.patch)].some(g => g.nodes.some(n => ['send', 'trackAudio', 'trackNotes'].includes(n.type)))) throw new Error('Asset contains unresolved external routing')
  for (const id of original.payload.sampleIds) if (!catalog.samples.some(s => s.id === id) && !project.samples.some(s => s.id === id)) throw new Error(`Sample metadata missing: ${id}`)
  const domain = original.payload.kind === 'instrument' ? 'patch' : original.payload.kind === 'note-effect' ? 'notes' : 'fx'
  let next = project, scope: SnapshotScope
  if (destination.mode === 'new-track') {
    if (domain !== 'patch') throw new Error('Effects require an explicit replacement scope')
    if (project.tracks.length >= 64) throw new Error('Project track limit reached')
    const track = createTrack(item.name.slice(0, 40), project.sceneCount)
    next = { ...next, tracks: [...next.tracks, track] }; scope = { owner: { kind: 'track', trackId: track.id }, domain }
  } else {
    if (!destination.scope || destination.scope.domain !== domain) throw new Error(`Choose a compatible ${domain} replacement scope`)
    scope = destination.scope
  }
  const copy = copyAsset(original.payload, scope.owner), payload = copy.payload
  const owner = scope.owner, track = owner.kind === 'track' ? next.tracks.find(t => t.id === owner.trackId) : undefined
  const bus = owner.kind === 'group' ? next.groups?.find(g => g.id === owner.groupId)?.bus : undefined
  if (payload.kind === 'audio-effect') {
    const input = owner.kind === 'master' ? 'masterIn' : owner.kind === 'group' ? 'groupIn' : track?.kind === 'return' ? 'returnIn' : 'trackIn'
    const incompatible = [payload.graph, ...payload.modules.map(m => m.patch)].flatMap(g => g.nodes).find(n => EFFECT_INPUTS.includes(n.type) && n.type !== input)
    if (incompatible) throw new Error(`Effect requires ${incompatible.type} routing; destination provides ${input}`)
  }
  if ((domain !== 'fx' && track?.kind !== 'instrument') || (owner.kind === 'track' && !track) || (owner.kind === 'group' && !bus)) throw new Error('Destination graph is unavailable')
  const revisionId = createId('revision')
  const associated = catalog.items.filter(i => !i.trashed && i.content.kind === 'preset' && i.content.assetId === (content.kind === 'preset' ? content.assetId : item.id))
  const sounds = [item, ...associated.filter(i => i.id !== item.id)].filter(i => 'state' in i.content)
  if ((next.presets?.length ?? 0) + sounds.length > 128 || (next.assetRevisions?.length ?? 0) >= 64 || next.modules.length + payload.modules.length > 128) throw new Error('Project preset/revision/module limit reached')
  const presets: ProjectPreset[] = sounds.map(i => {
    const state = (i.content as typeof content).state
    const domains = payload.kind === 'instrument' ? ['patch', 'notes'] : [domain]
    const belongs = (target: ControlTarget | SampleTarget) => target.kind === 'graph' && domains.includes(target.domain) && JSON.stringify(target.owner) === JSON.stringify(state.scope.owner)
    if (state.scope.domain !== domain || state.values.some(v => !belongs(v.target)) || state.samples.some(b => !belongs(b.target))) throw new Error('Preset contains unresolved external routing or controls outside its asset scope')
    return { ...state, id: createId('preset'), revisionId, scope: { ...state.scope, owner }, values: state.values.map(v => ({ ...v, target: copy.target(v.target) })), samples: state.samples.map(s => ({ ...s, target: copy.target(s.target) })) }
  })
  const affected = (target: { owner: ControlOwner; domain?: string }) => JSON.stringify(target.owner) === JSON.stringify(owner) && (target.domain === domain || payload.kind === 'instrument' && target.domain === 'notes')
  next = { ...next,
    tracks: next.tracks.map(t => owner.kind === 'track' && t.id === owner.trackId ? payload.kind === 'instrument' && t.kind === 'instrument' ? { ...t, patch: payload.patch, noteGraph: payload.noteGraph, voices: payload.voices } : payload.kind === 'note-effect' && t.kind === 'instrument' ? { ...t, noteGraph: payload.graph } : payload.kind === 'audio-effect' ? { ...t, fx: payload.graph } : t : t),
    master: owner.kind === 'master' && payload.kind === 'audio-effect' ? { ...next.master, fx: payload.graph } : next.master,
    ...(owner.kind === 'group' && payload.kind === 'audio-effect' && { groups: next.groups?.map(g => g.id === owner.groupId && g.bus ? { ...g, bus: { ...g.bus, fx: payload.graph } } : g) }),
    modules: [...next.modules, ...payload.modules],
    samples: [...next.samples, ...catalog.samples.filter(s => payload.sampleIds.includes(s.id) && !next.samples.some(known => known.id === s.id))],
    controlValues: next.controlValues?.filter(v => !affected(v.target)), sampleBindings: next.sampleBindings?.filter(b => !affected(b.target)),
    assetRevisions: [...(next.assetRevisions ?? []), { id: revisionId, payload, signature: assetSignature(payload) }], presets: [...(next.presets ?? []), ...presets],
    libraryOrigins: [...(next.libraryOrigins ?? []), insertedOrigin(project, item.id, original.id, { owner, domain }, copy, destination.carry)],
  }
  if ((next.libraryOrigins?.length ?? 0) > 4096 || (next.controlValues?.length ?? 0) > 4096 || (next.sampleBindings?.length ?? 0) > 4096) throw new Error('Project library/control collection limit reached (4096)')
  if (next.samples.length > 256) throw new Error('Project sample limit reached')
  // Apply the saved sound after the complete graph/module/sample closure is installed.
  const state = presets[0]!
  for (const value of state.values) { const result = editControlBase(next, value.target, value.value); if (result.status !== 'applied') throw new Error(`Saved control is unavailable: ${result.reason}`); next = result.project }
  for (const binding of state.samples) {
    if (resolveSampleTarget(next, binding.target).status !== 'available' || binding.sampleId !== null && !next.samples.some(s => s.id === binding.sampleId)) throw new Error('Saved sample binding is unavailable')
    next = editSampleBinding(next, binding)
  }
  if ((next.controlValues?.length ?? 0) > 4096) throw new Error('Project control value limit reached (4096)')
  return { project: next, scope }
}
/** Dependency preview is also used to preflight blob availability before a project transaction. */
export const libraryDependencies = (catalog: LibraryCatalog, item: LibraryItem) => {
  const c = item.content, revision = 'revisionId' in c ? catalog.revisions.find(r => r.id === c.revisionId) : undefined
  const sampleIds = revision?.payload.sampleIds ?? (c.kind === 'sample' ? [c.sampleId] : c.kind === 'audio-clip' ? [c.clip.sampleId] : [])
  return { sampleIds, modules: revision?.payload.modules.length ?? 0, presets: catalog.items.filter(i => !i.trashed && i.content.kind === 'preset' && i.content.assetId === item.id).length, routing: 'Project sends and track taps excluded; external routing graphs cannot be saved.' }
}
