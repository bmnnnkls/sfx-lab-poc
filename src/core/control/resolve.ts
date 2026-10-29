import { type ParamSpec, findNodeDefinition, paramPortId } from '../dsp'
import { type Patch, type PatchNode, describeNode, flattenPatch, resolveSpec } from '../patch'
import { type Project, busGroups, mixesAfter } from '../project'
import { controlTargetKey, type ControlOwner, type ControlTarget, type ControlResolution } from './types'
import { clampControlValue } from './values'

export const controlGraph = (project: Project, owner: ControlOwner, domain: 'patch' | 'notes' | 'fx'): Patch | undefined => {
  if (owner.kind === 'master') return domain === 'fx' ? project.master.fx : undefined
  if (owner.kind === 'group') return domain === 'fx' ? project.groups?.find((group) => group.id === owner.groupId)?.bus?.fx : undefined
  const track = project.tracks.find((track) => track.id === owner.trackId)
  return domain === 'fx' ? track?.fx : track?.kind === 'instrument' ? domain === 'patch' ? track.patch : track.noteGraph : undefined
}
export const flatControlNodeId = (target: Extract<ControlTarget, { kind: 'graph' }>): string => [...target.path.map((step) => step.nodeId), target.nodeId].join('/')

export const resolveControlTarget = (project: Project, target: ControlTarget): ControlResolution => {
  const owner = target.owner
  const track = owner.kind === 'track' ? project.tracks.find((track) => track.id === owner.trackId) : undefined
  if (target.owner.kind === 'track' && !track) return { status: 'missing', reason: 'Owner track is missing' }
  const group = owner.kind === 'group' ? project.groups?.find((candidate) => candidate.id === owner.groupId) : undefined
  if (owner.kind === 'group' && !group) return { status: 'missing', reason: 'Owner group is missing' }
  // A folder has nothing to control until it sums to a bus.
  if (group && !group.bus) return { status: 'missing', reason: 'The group has no bus' }
  if (target.kind === 'mixer' && group?.bus) {
    const bus = group.bus
    if (target.control === 'send') {
      if (!project.tracks.some((candidate) => candidate.id === target.returnId && candidate.kind === 'return')) return { status: 'missing', reason: 'Destination return is missing' }
      if (mixesAfter(project, group.id, target.returnId)) return { status: 'incompatible', reason: 'Send would create an audio loop' }
    }
    const spec: ParamSpec = { id: target.control, label: target.control, min: target.control === 'pan' ? -1 : 0, max: 1, default: target.control === 'volume' ? 1 : 0 }
    const baseValue = target.control === 'send' ? bus.sends[target.returnId] ?? 0 : target.control === 'pan' ? bus.pan ?? 0 : bus.volume
    return { status: 'available', spec, baseValue, automatable: true, interpolation: 'linear' }
  }
  if (target.kind === 'mixer') {
    if (target.owner.kind === 'master' && target.control !== 'volume') return { status: 'incompatible', reason: 'Master supports volume only' }
    if (target.control === 'send') {
      if (!track || track.kind === 'return') return { status: 'incompatible', reason: 'This owner has no sends' }
      if (!project.tracks.some((candidate) => candidate.id === target.returnId && candidate.kind === 'return')) return { status: 'missing', reason: 'Destination return is missing' }
      if (mixesAfter(project, track.id, target.returnId)) return { status: 'incompatible', reason: 'Send would create an audio loop' }
    }
    const spec: ParamSpec = { id: target.control, label: target.control, min: target.control === 'pan' ? -1 : 0, max: 1, default: target.control === 'volume' ? 1 : 0 }
    const baseValue = target.control === 'send' ? track && track.kind !== 'return' ? track.sends[target.returnId] ?? 0 : 0 : target.control === 'pan' ? track?.pan ?? 0 : track?.volume ?? project.master.volume ?? 1
    return { status: 'available', spec, baseValue, automatable: true, interpolation: 'linear' }
  }
  let patch = controlGraph(project, target.owner, target.domain)
  if (!patch) return { status: 'incompatible', reason: 'Owner does not support this graph domain' }
  const root = patch
  if (target.path.length > 0 && [...target.path.map((step) => step.nodeId), target.nodeId].some((id) => id.includes('/'))) return { status: 'incompatible', reason: 'Instance IDs contain the reserved flatten separator' }
  if (target.path.length > 32) return { status: 'incompatible', reason: 'Instance path is too deep' }
  for (const step of target.path) {
    const use = patch.nodes.find((node) => node.id === step.nodeId)
    if (!use) return { status: 'missing', reason: 'Module instance is missing' }
    if (use.type !== 'module' || use.moduleId !== step.moduleId) return { status: 'incompatible', reason: 'Module instance was replaced' }
    const definition = project.modules.find((module) => module.id === step.moduleId)
    if (!definition) return { status: 'missing', reason: 'Module definition is missing' }
    patch = definition.patch
  }
  const original = patch.nodes.find((node) => node.id === target.nodeId)
  if (!original) return { status: 'missing', reason: 'Node is missing' }
  if (original.type !== target.nodeType || original.type === 'module') return { status: 'incompatible', reason: 'Node type changed' }
  const flat = flattenPatch(root, project.modules)
  const matches = flat.nodes.filter((node) => node.id === flatControlNodeId(target))
  if (matches.length !== 1) return { status: 'incompatible', reason: 'Ambiguous or unavailable flattened identity' }
  const node = matches[0] as PatchNode
  const shape = describeNode(node, project.modules)
  const rawSpec = shape?.params.find((spec) => spec.id === target.paramId)
  if (!rawSpec) return { status: 'missing', reason: 'Parameter is missing' }
  const live = resolveSpec(node, rawSpec)
  const spec = node.type === 'selector' && target.paramId === 'index' ? { ...live, max: Math.max(1, Math.min(16, Math.round(node.params.count ?? 4))) - 1 } : live
  const driven = flat.connections.some((wire) => wire.to.node === node.id && wire.to.port === paramPortId(target.paramId))
  const panelKind = findNodeDefinition(node.type)?.panelKind
  const structural = panelKind !== undefined && !({ value: ['value'], xy: ['x', 'y'], switch: ['on'], selector: ['index'], led: [], bar: [], display: [] }[panelKind] as readonly string[]).includes(target.paramId)
  const saved = project.controlValues?.find((entry) => controlTargetKey(entry.target) === controlTargetKey(target))
  return { status: 'available', spec, baseValue: clampControlValue(spec, saved?.value ?? node.params[spec.id] ?? spec.default), automatable: !driven && !structural, interpolation: spec.options || node.type === 'switch' || node.type === 'selector' ? 'hold' : 'linear', ...(driven ? { reason: 'Driven by a wire; target the upstream control' } : structural ? { reason: 'Control configuration is not a performance target' } : {}) }
}

export const enumerateControlTargets = (project: Project): ControlTarget[] => {
  const targets: ControlTarget[] = []
  const owners: ControlOwner[] = [
    ...project.tracks.map((track): ControlOwner => ({ kind: 'track', trackId: track.id })),
    ...busGroups(project).map((group): ControlOwner => ({ kind: 'group', groupId: group.id })),
    { kind: 'master' },
  ]
  const returns = project.tracks.filter((track) => track.kind === 'return')
  for (const owner of owners) {
    targets.push({ kind: 'mixer', owner, control: 'volume' })
    if (owner.kind !== 'master') {
      targets.push({ kind: 'mixer', owner, control: 'pan' })
      if (owner.kind === 'group' || project.tracks.find((track) => track.id === owner.trackId)?.kind !== 'return') for (const bus of returns) targets.push({ kind: 'mixer', owner, control: 'send', returnId: bus.id })
    }
    for (const domain of ['patch', 'notes', 'fx'] as const) {
      const walk = (patch: Patch, path: Extract<ControlTarget, { kind: 'graph' }>['path'], seen: ReadonlySet<string>) => {
        if (path.length > 32) return
        for (const node of patch.nodes) {
          if (node.type === 'module') {
            const definition = project.modules.find((module) => module.id === node.moduleId)
            if (definition && !seen.has(definition.id)) walk(definition.patch, [...path, { nodeId: node.id, moduleId: definition.id }], new Set([...seen, definition.id]))
          } else for (const spec of describeNode(node)?.params ?? []) targets.push({ kind: 'graph', owner, domain, path, nodeId: node.id, nodeType: node.type, paramId: spec.id })
        }
      }
      const graph = controlGraph(project, owner, domain)
      if (graph) walk(graph, [], new Set())
    }
  }
  return targets
}
