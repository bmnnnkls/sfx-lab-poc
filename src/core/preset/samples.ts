import { controlGraph, controlTargetKey, flatControlNodeId, type ControlOwner } from '../control'
import { describeNode, flattenPatch, type Patch } from '../patch'
import type { Project } from '../project'
import type { SampleBinding, SampleTarget } from './types'
export const sampleTargetKey = (target: SampleTarget) => controlTargetKey({ ...target, paramId: '__sample' })
export const resolveSampleTarget = (project: Project, target: SampleTarget) => {
  let graph = controlGraph(project, target.owner, target.domain)
  if (!graph) return { status: 'missing' as const, reason: 'Sample graph is missing' }
  if (target.path.length > 32) return { status: 'incompatible' as const, reason: 'Sample path is too deep' }
  for (const step of target.path) {
    const use = graph.nodes.find(n => n.id === step.nodeId)
    if (!use) return { status: 'missing' as const, reason: 'Sample instance is missing' }
    if (use.type !== 'module' || use.moduleId !== step.moduleId) return { status: 'incompatible' as const, reason: 'Sample instance was replaced' }
    const module = project.modules.find(m => m.id === step.moduleId)
    if (!module) return { status: 'missing' as const, reason: 'Sample module is missing' }
    graph = module.patch
  }
  const node = graph.nodes.find(n => n.id === target.nodeId)
  if (!node) return { status: 'missing' as const, reason: 'Sample node is missing' }
  if (node.type !== target.nodeType || !describeNode(node)?.usesSample) return { status: 'incompatible' as const, reason: 'Sample node type changed' }
  const root = controlGraph(project, target.owner, target.domain)!
  if ([...target.path.map(s => s.nodeId), target.nodeId].some(id => id.includes('/')) && target.path.length > 0) return { status: 'incompatible' as const, reason: 'Ambiguous sample path' }
  const flatId = flatControlNodeId({ ...target, paramId: '' })
  if (flattenPatch(root, project.modules).nodes.filter(n => n.id === flatId).length !== 1) return { status: 'incompatible' as const, reason: 'Ambiguous sample identity' }
  const binding = project.sampleBindings?.find(b => sampleTargetKey(b.target) === sampleTargetKey(target))
  return { status: 'available' as const, sampleId: binding ? binding.sampleId : node.sampleId ?? null }
}
export const enumerateSampleTargets = (project: Project): SampleTarget[] => {
  const result: SampleTarget[] = []
  const owners: ControlOwner[] = [...project.tracks.map(t => ({ kind: 'track' as const, trackId: t.id })), { kind: 'master' }]
  for (const owner of owners) for (const domain of ['patch', 'notes', 'fx'] as const) {
    const walk = (graph: Patch, path: SampleTarget['path'], seen: ReadonlySet<string>) => {
      if (path.length > 32) return
      for (const node of graph.nodes) {
        if (node.type === 'module') {
          const m = project.modules.find(m => m.id === node.moduleId)
          if (m && !seen.has(m.id)) walk(m.patch, [...path, { nodeId: node.id, moduleId: m.id }], new Set([...seen, m.id]))
        } else if (describeNode(node)?.usesSample) result.push({ kind: 'graph', owner, domain, path, nodeId: node.id, nodeType: node.type })
      }
    }
    const graph = controlGraph(project, owner, domain)
    if (graph) walk(graph, [], new Set())
  }
  return result
}
export const editSampleBinding = (project: Project, binding: SampleBinding): Project => {
  if (resolveSampleTarget(project, binding.target).status !== 'available' || (binding.sampleId !== null && !project.samples.some(s => s.id === binding.sampleId))) return project
  if ((project.sampleBindings?.length ?? 0) >= 4096 && !project.sampleBindings?.some(b => sampleTargetKey(b.target) === sampleTargetKey(binding.target))) throw new Error('Sample binding limit reached')
  return { ...project, sampleBindings: [...(project.sampleBindings ?? []).filter(b => sampleTargetKey(b.target) !== sampleTargetKey(binding.target)), binding] }
}
/** Flatten only affected graphs; defaults remain on shared definitions in the authored document. */
export const projectWithSampleBindings = (project: Project): Project => {
  let next = project
  for (const binding of project.sampleBindings ?? []) {
    if (resolveSampleTarget(project, binding.target).status !== 'available') continue
    const { target, sampleId } = binding, graph = controlGraph(next, target.owner, target.domain)
    if (!graph) continue
    const flatId = flatControlNodeId({ ...target, paramId: '' })
    const flat = flattenPatch(graph, project.modules)
    const patch = { ...flat, nodes: flat.nodes.map(n => {
      if (n.id !== flatId) return n
      const { sampleId: _default, ...rest } = n
      return sampleId === null ? rest : { ...rest, sampleId }
    }) }
    if (target.owner.kind === 'master') next = { ...next, master: { ...next.master, fx: patch } }
    else {
      const trackId = target.owner.trackId
      next = { ...next, tracks: next.tracks.map(t => t.id !== trackId ? t : target.domain === 'fx' ? { ...t, fx: patch } : t.kind !== 'instrument' ? t : target.domain === 'patch' ? { ...t, patch } : { ...t, noteGraph: patch }) }
    }
  }
  return next
}
