import { controlGraph } from '../control'
import type { ModuleDefinition, Patch } from '../patch'
import type { Project } from '../project'
import { compareCodeUnits, createId } from '../shared'
import { enumerateSampleTargets, editSampleBinding, resolveSampleTarget } from './samples'
import { captureSnapshot, inSnapshotScope, recallSnapshot } from './snapshots'
import type { AssetPayload, AssetRevision, ProjectPreset, RecallIssue, SnapshotScope } from './types'

/** The node types that read another track: an asset can't carry them, so a capture refuses them. */
export const EXTERNAL_ROUTING: readonly string[] = ['send', 'trackAudio', 'trackNotes']

/** Only the transitive closure belongs to an asset. Reject external routing rather than silently rebinding it. */
export const captureAsset = (project: Project, scope: SnapshotScope): AssetPayload => {
  if (scope.domain === 'track') throw new Error('Choose Instrument, Effects or Notes for a preset')
  const graph = controlGraph(project, scope.owner, scope.domain)
  if (!graph) throw new Error('This owner has no selected graph')
  const modules: ModuleDefinition[] = [], seen = new Set<string>(), visiting = new Set<string>(), samples = new Set<string>()
  const walk = (patch: Patch) => {
    for (const node of patch.nodes) {
      if (EXTERNAL_ROUTING.includes(node.type)) throw new Error('Presets require graphs without external track routing')
      if (node.sampleId) samples.add(node.sampleId)
      if (node.type === 'module' && node.moduleId && visiting.has(node.moduleId)) throw new Error('Cyclic module dependency')
      if (node.type === 'module' && node.moduleId && !seen.has(node.moduleId)) {
        seen.add(node.moduleId)
        const module = project.modules.find(m => m.id === node.moduleId)
        if (!module) throw new Error('A module dependency is missing')
        visiting.add(module.id); modules.push(module); walk(module.patch); visiting.delete(module.id)
      }
    }
  }
  walk(graph)
  for (const target of enumerateSampleTargets(project).filter(t => inSnapshotScope(t, scope))) {
    const result = resolveSampleTarget(project, target)
    if (result.status === 'available' && result.sampleId) samples.add(result.sampleId)
  }
  if (scope.domain === 'patch') {
    const track = scope.owner.kind === 'track' ? project.tracks.find(t => t.id === (scope.owner.kind === 'track' ? scope.owner.trackId : '')) : undefined
    if (track?.kind !== 'instrument') throw new Error('Instrument track required')
    walk(track.noteGraph)
    return { kind: 'instrument', patch: graph, noteGraph: track.noteGraph, voices: track.voices, modules, sampleIds: [...samples] }
  }
  return { kind: scope.domain === 'notes' ? 'note-effect' : 'audio-effect', graph, modules, sampleIds: [...samples] }
}
/** A collision-free canonical structural identity, separate from the opaque revision ID. */
export const assetSignature = (payload: AssetPayload): string => {
  const shape = (graph: Patch) => ({ nodes: [...graph.nodes].sort((a,b) => compareCodeUnits(a.id, b.id)).map(n => ({ id: n.id, type: n.type, moduleId: n.moduleId, stereo: n.stereo ?? false, bypassed: n.bypassed ?? false,
    // Control ranges/modes change interpretation; ordinary sound values are preset state.
    config: ['control', 'xy', 'switch', 'selector'].includes(n.type) ? Object.fromEntries(Object.entries(n.params).filter(([key]) => !['value', 'x', 'y', 'on', 'index'].includes(key)).sort(([a], [b]) => compareCodeUnits(a, b))) : undefined })),
    connections: graph.connections.map(c => [c.from.node, c.from.port, c.to.node, c.to.port]).sort((a,b) => compareCodeUnits(JSON.stringify(a), JSON.stringify(b))) })
  return JSON.stringify([payload.kind, payload.kind === 'instrument' ? [shape(payload.patch), shape(payload.noteGraph), payload.voices] : shape(payload.graph), [...payload.modules].sort((a,b) => compareCodeUnits(a.id, b.id)).map(m => [m.id, m.inputs.map(p => [p.id, p.inner.node, p.inner.port]).sort(), m.outputs.map(p => [p.id, p.inner.node, p.inner.port]).sort(), m.knobs.map(k => [k.id, k.node, k.param]).sort(), shape(m.patch)])])
}
export const saveProjectPreset = (project: Project, scope: SnapshotScope, name: string, id = createId('preset')): Project => {
  if (!project.presets?.some(p => p.id === id) && (project.presets?.length ?? 0) >= 128) throw new Error('Project preset limit reached (128)')
  const payload = captureAsset(project, scope), signature = assetSignature(payload)
  const existing = project.assetRevisions?.find(r => r.signature === signature)
  if (!existing && (project.assetRevisions?.length ?? 0) >= 64) throw new Error('Asset revision limit reached (64)')
  const revision: AssetRevision = existing ?? { id: createId('revision'), signature, payload }
  // An instrument preset includes note controls and their sample selections as well.
  const scopes = payload.kind === 'instrument' ? [scope, { ...scope, domain: 'notes' as const }] : [scope]
  const snapshot = captureSnapshot(project, scope, name, id)
  const preset: ProjectPreset = { ...snapshot, revisionId: revision.id,
    values: scopes.flatMap(s => captureSnapshot(project, s, name).values),
    samples: enumerateSampleTargets(project).filter(t => scopes.some(s => inSnapshotScope(t, s))).map(target => {
      const result = resolveSampleTarget(project, target)
      return { target, sampleId: result.status === 'available' ? result.sampleId : null }
    }) }
  if (preset.values.length > 4096 || preset.samples.length > 4096) throw new Error('Preset exceeds 4096 controls or sample bindings')
  return { ...project, assetRevisions: existing ? project.assetRevisions : [...(project.assetRevisions ?? []), revision], presets: [...(project.presets ?? []).filter(p => p.id !== id), preset] }
}
/** Whether `recallProjectPreset` can recall a preset onto a scope: its revision is there, and the scope's graph is of its kind and matches it. */
export const canRecallProjectPreset = (project: Project, preset: ProjectPreset, scope = preset.scope): boolean => {
  const revision = project.assetRevisions?.find(r => r.id === preset.revisionId)
  if (!revision || scope.domain !== preset.scope.domain) return false
  try { return assetSignature(captureAsset(project, scope)) === revision.signature } catch { return false }
}
export const recallProjectPreset = (project: Project, preset: ProjectPreset, scope = preset.scope) => {
  const issues: RecallIssue[] = []
  const revision = project.assetRevisions?.find(r => r.id === preset.revisionId)
  if (!revision) throw new Error('Preset asset revision is missing')
  if (scope.domain !== preset.scope.domain) throw new Error('Preset graph kind does not match this scope')
  if (assetSignature(captureAsset(project, scope)) !== revision.signature) throw new Error('Graph differs from the preset asset revision; save a new preset revision')
  const remap = <T extends { readonly owner: SnapshotScope['owner'] }>(target: T): T => ({ ...target, owner: scope.owner })
  // Instrument state spans patch + notes; each sub-scope is still validated by recallSnapshot.
  let next = project
  const applied = [] as ReturnType<typeof recallSnapshot>['applied']
  const domains = revision.payload.kind === 'instrument' ? ['patch', 'notes'] : [scope.domain]
  const belongs = (target: Parameters<typeof inSnapshotScope>[0]) => domains.some(domain => inSnapshotScope(target, { ...preset.scope, domain: domain as SnapshotScope['domain'] }))
  for (const entry of preset.values) if (!belongs(entry.target)) issues.push({ target: entry.target, status: 'incompatible', reason: 'Preset control is outside its asset scope' })
  for (const domain of revision.payload.kind === 'instrument' ? ['patch', 'notes'] as const : [scope.domain]) {
    const result = recallSnapshot(next, { ...preset, scope: { ...scope, domain }, values: preset.values.filter(e => belongs(e.target) && e.target.kind === 'graph' && e.target.domain === domain).map(e => ({ ...e, target: remap(e.target) })) })
    next = result.project; applied.push(...result.applied); issues.push(...result.issues)
  }
  for (const binding of preset.samples) {
    if (!belongs(binding.target)) { issues.push({ target: binding.target, status: 'incompatible', reason: 'Preset sample is outside its asset scope' }); continue }
    const target = remap(binding.target), result = resolveSampleTarget(project, target)
    if (result.status !== 'available') issues.push({ target, ...result })
    else if (binding.sampleId !== null && !project.samples.some(s => s.id === binding.sampleId)) issues.push({ target, status: 'missing', reason: `Sample ${binding.sampleId} is missing` })
    else next = editSampleBinding(next, { ...binding, target })
  }
  return { project: next, applied, issues }
}

export const deleteProjectPreset = (project: Project, id: string): Project => {
  const presets = (project.presets ?? []).filter(p => p.id !== id)
  const used = new Set(presets.map(p => p.revisionId))
  return { ...project, presets, assetRevisions: project.assetRevisions?.filter(r => used.has(r.id)) }
}
export const duplicateProjectPreset = (project: Project, preset: ProjectPreset): Project => {
  if ((project.presets?.length ?? 0) >= 128) throw new Error('Project preset limit reached (128)')
  return { ...project, presets: [...(project.presets ?? []), { ...preset, id: createId('preset'), name: `${preset.name} copy`.slice(0, 80) }] }
}
