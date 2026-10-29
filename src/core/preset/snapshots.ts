import { controlGraph, controlOwnerId, controlTargetKey, controlToNormalized, controlFromNormalized, editControlBase, enumerateControlTargets, resolveControlTarget, type ControlTarget, type ControlValue } from '../control'
import { flattenPatch } from '../patch'
import type { Project } from '../project'
import { createId } from '../shared'
import type { Snapshot, SnapshotScope, RecallIssue } from './types'
export const inSnapshotScope = (target: Pick<ControlTarget, 'kind' | 'owner'> & { readonly domain?: string }, scope: SnapshotScope): boolean =>
  target.owner.kind === scope.owner.kind && controlOwnerId(target.owner) === controlOwnerId(scope.owner) && (scope.domain === 'track' || (target.kind === 'graph' && target.domain === scope.domain))
export const isSnapshotControl = (project: Project, target: ControlTarget): boolean => {
  const resolved = resolveControlTarget(project, target)
  if (resolved.status !== 'available' || !resolved.automatable) return false
  if (target.kind !== 'graph' || target.nodeType !== 'switch') return true
  const graph = controlGraph(project, target.owner, target.domain)
  const node = graph && flattenPatch(graph, project.modules).nodes.find(n => n.id === [...target.path.map(s => s.nodeId), target.nodeId].join('/'))
  return (node?.params.mode ?? 0) === 0
}
/** Capture authored bases, including instance values; Read/override traffic is transient. */
export const captureSnapshot = (project: Project, scope: SnapshotScope, name: string, id = createId('snapshot')): Snapshot => ({
  id, name: name.trim().slice(0, 80) || 'Snapshot', scope,
  values: enumerateControlTargets(project).filter(t => inSnapshotScope(t, scope) && isSnapshotControl(project, t)).map(target => {
    const resolved = resolveControlTarget(project, target)
    return { target, value: resolved.status === 'available' ? resolved.baseValue : 0 }
  }),
})
export const recallSnapshot = (project: Project, snapshot: Snapshot) => {
  let next = project
  const applied: ControlValue[] = [], issues: RecallIssue[] = []
  for (const entry of snapshot.values) {
    const result = resolveControlTarget(project, entry.target)
    if (result.status !== 'available') { issues.push({ target: entry.target, ...result }); continue }
    if (!inSnapshotScope(entry.target, snapshot.scope) || !isSnapshotControl(project, entry.target)) { issues.push({ target: entry.target, status: 'incompatible', reason: result.reason ?? 'Outside scope or no longer a performance control' }); continue }
    const edited = editControlBase(next, entry.target, entry.value)
    if (edited.status === 'applied') { next = edited.project; applied.push(entry) }
    else issues.push({ target: entry.target, status: edited.status, reason: edited.reason })
  }
  return { project: next, applied, issues }
}
export const putSnapshot = (project: Project, snapshot: Snapshot): Project => {
  if (snapshot.values.length > 4096 || (!project.snapshots?.some(s => s.id === snapshot.id) && (project.snapshots?.length ?? 0) >= 128)) throw new Error('Snapshot limit reached (128 snapshots / 4096 controls)')
  return { ...project, snapshots: [...(project.snapshots ?? []).filter(s => s.id !== snapshot.id), snapshot] }
}
export const deleteSnapshot = (project: Project, id: string): Project => ({ ...project, snapshots: (project.snapshots ?? []).filter(s => s.id !== id) })
export const duplicateSnapshot = (project: Project, snapshot: Snapshot): Project => putSnapshot(project, { ...snapshot, id: createId('snapshot'), name: `${snapshot.name} copy`.slice(0, 80) })
export const morphSnapshots = (project: Project, a: Snapshot, b: Snapshot, amount: number): Snapshot => {
  const t = Math.max(0, Math.min(1, Number.isFinite(amount) ? amount : 0))
  const right = new Map(b.values.map(e => [controlTargetKey(e.target), e]))
  if (JSON.stringify(a.scope) !== JSON.stringify(b.scope) || a.values.length !== b.values.length || a.values.some(e => !right.has(controlTargetKey(e.target)))) throw new Error('Morph requires snapshots with identical scopes and targets')
  return { ...a, values: a.values.map(entry => {
    const end = right.get(controlTargetKey(entry.target))!, resolved = resolveControlTarget(project, entry.target)
    if (resolved.status !== 'available' || !isSnapshotControl(project, entry.target)) throw new Error('Morph target is unavailable')
    return { target: entry.target, value: resolved.interpolation === 'hold' ? (t < 0.5 ? entry.value : end.value)
      : controlFromNormalized(resolved.spec, controlToNormalized(resolved.spec, entry.value) * (1 - t) + controlToNormalized(resolved.spec, end.value) * t) }
  }) }
}
