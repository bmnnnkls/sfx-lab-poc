import { describe, expect, it } from 'vitest'
import { createNode, type ModuleDefinition, type Patch, setNodeName } from '../patch'
import { createDemoProject, editPatchAt, groupNodesAsModule, unlinkModuleNode, type Project } from '../project'
import { parseProject, serializeProject } from '../persistence'
import { diffProject } from '../sync'
import { controlTargetForGraphParam, controlFromNormalized, controlToNormalized, editControlBase, enumerateControlTargets, effectiveControlReadouts, projectWithControlValues, remapControlTarget, remapControlValues, resolveControlTarget, type ControlTarget } from './index'

const setup = () => {
  const node = { ...createNode('control', 0, 0), id: 'knob', params: { value: 0.2, min: 0, max: 1 } }
  // The registry calls a control `control` (not the panelKind `value`).
  const leaf: ModuleDefinition = { id: 'leaf', name: 'Leaf', patch: { nodes: [node], connections: [] }, inputs: [], outputs: [], knobs: [] }
  const use = (id: string, moduleId: string) => ({ ...createNode('control', 0, 0), id, type: 'module', moduleId, params: {} })
  const outer: ModuleDefinition = { id: 'outer', name: 'Outer', patch: { nodes: [use('child', 'leaf')], connections: [] }, inputs: [], outputs: [], knobs: [] }
  const base = createDemoProject()
  const track = base.tracks[0]!
  const project = editPatchAt({ ...base, modules: [leaf, outer] }, { trackId: track.id }, () => ({ nodes: [use('a', 'outer'), use('b', 'outer')], connections: [] }))
  const target: ControlTarget = { kind: 'graph', owner: { kind: 'track', trackId: track.id }, domain: 'patch', path: [{ nodeId: 'a', moduleId: 'outer' }, { nodeId: 'child', moduleId: 'leaf' }], nodeId: 'knob', nodeType: 'control', paramId: 'value' }
  return { project, target, trackId: track.id }
}
const value = (project: Project, target: ControlTarget) => {
  const result = resolveControlTarget(project, target)
  if (result.status !== 'available') throw new Error(result.reason)
  return result.baseValue
}

describe('control targets', () => {
  it('addresses two uses and deeper nested uses independently; rename and reload preserve identity', () => {
    const { project, target, trackId } = setup()
    const sibling = { ...target, path: [{ nodeId: 'b', moduleId: 'outer' }, { nodeId: 'child', moduleId: 'leaf' }] }
    const edited = editControlBase(project, target, 0.8).project
    expect(value(edited, target)).toBe(0.8)
    expect(value(edited, sibling)).toBe(0.2)
    expect(edited.modules).toBe(project.modules)
    const renamed = editPatchAt(edited, { trackId }, (patch) => setNodeName(patch, 'a', 'Renamed'))
    const loaded = parseProject(serializeProject(renamed))
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.warnings).toEqual([])
    expect(value(loaded.project, target)).toBe(0.8)
    expect(value(loaded.project, sibling)).toBe(0.2)
    expect(diffProject(project, edited)).toContainEqual({ type: 'track/setParam', graph: 'patch', trackId, nodeId: 'a/child/knob', paramId: 'value', value: 0.8 })
    expect(enumerateControlTargets(edited)).toContainEqual(target)
  })

  it('reports deletion, module replacement, changed node types and unsupported domains explicitly', () => {
    const { project, target, trackId } = setup()
    expect(resolveControlTarget(project, { ...target, nodeId: 'gone' }).status).toBe('missing')
    expect(resolveControlTarget(project, { ...target, nodeType: 'filter' }).status).toBe('incompatible')
    expect(resolveControlTarget(project, { ...target, path: [{ nodeId: 'a', moduleId: 'leaf' }] }).status).toBe('incompatible')
    expect(resolveControlTarget(project, { ...target, owner: { kind: 'master' } }).status).toBe('incompatible')
    const deleted = editPatchAt(project, { trackId }, () => ({ nodes: [], connections: [] }))
    expect(resolveControlTarget(deleted, target).status).toBe('missing')
  })

  it('normalizes logarithmic/exponential/stepped/enumerated and degenerate ranges safely', () => {
    const log = { id: 'f', label: 'f', min: 20, max: 20000, default: 440, curve: 'log' as const }
    expect(controlFromNormalized(log, 0.5)).toBeCloseTo(Math.sqrt(20 * 20000))
    for (const curve of ['linear', 'log', 'exp'] as const) {
      const spec = { ...log, curve }
      expect(controlToNormalized(spec, controlFromNormalized(spec, 0.35))).toBeCloseTo(0.35)
      expect(controlFromNormalized(spec, -1)).toBe(20)
      expect(controlFromNormalized(spec, 2)).toBe(20000)
    }
    expect(controlFromNormalized({ ...log, min: 0, max: 4, step: 1, options: ['a', 'b', 'c', 'd', 'e'] }, 0.6)).toBe(2)
    expect(controlToNormalized({ ...log, min: 1, max: 1 }, 1)).toBe(0)
    expect(Number.isFinite(controlFromNormalized(log, NaN))).toBe(true)
  })

  it('keeps base edits possible on wired parameters but refuses runtime ownership, including module boundary wires', () => {
    const { project, trackId } = setup()
    const filter = { ...createNode('filter', 0, 0), id: 'filter' }
    const source = { ...createNode('control', 0, 0), id: 'source' }
    const patch: Patch = { nodes: [filter, source], connections: [{ id: 'wire', from: { node: 'source', port: 'out' }, to: { node: 'filter', port: 'param:cutoff' } }] }
    const wired = editPatchAt(project, { trackId }, () => patch)
    const target: ControlTarget = { kind: 'graph', owner: { kind: 'track', trackId }, domain: 'patch', path: [], nodeId: 'filter', nodeType: 'filter', paramId: 'cutoff' }
    expect(resolveControlTarget(wired, target)).toMatchObject({ status: 'available', automatable: false, reason: expect.stringContaining('wire') })
    expect(effectiveControlReadouts(wired, [{ target, value: 800 }])).toEqual([])
    expect(value(editControlBase(wired, target, 800).project, target)).toBe(800)
    const grouped = groupNodesAsModule(wired, { trackId }, ['filter'])
    const module = grouped.modules.at(-1)!
    const use = grouped.tracks[0]!.kind === 'instrument' ? grouped.tracks[0]!.patch.nodes.find((node) => node.moduleId === module.id)! : undefined
    expect(resolveControlTarget(grouped, { ...target, path: [{ nodeId: use!.id, moduleId: module.id }] })).toMatchObject({ status: 'available', automatable: false })
  })

  it('projects runtime overrides, restores bases on release and emits compact readouts', () => {
    const { project, target, trackId } = setup()
    const authored = editControlBase(project, target, 0.6).project
    const before = serializeProject(authored)
    const effective = projectWithControlValues(authored, [{ target, value: 0.9 }])
    expect(diffProject(projectWithControlValues(authored), effective)).toContainEqual({ type: 'track/setParam', graph: 'patch', trackId, nodeId: 'a/child/knob', paramId: 'value', value: 0.9 })
    expect(diffProject(effective, authored)).toContainEqual({ type: 'track/setParam', graph: 'patch', trackId, nodeId: 'a/child/knob', paramId: 'value', value: 0.6 })
    expect(effectiveControlReadouts(authored, [{ target, value: 0.9 }])).toEqual([{ target, baseValue: 0.6, value: 0.9 }])
    expect(serializeProject(authored)).toBe(before)
  })

  it('remaps saved routes through group and unlink without changing the sound value', () => {
    const { project, target, trackId } = setup()
    const authored = editControlBase(project, target, 0.7).project
    const grouped = groupNodesAsModule(authored, { trackId }, ['a'])
    expect(value(grouped, grouped.controlValues![0]!.target)).toBe(0.7)
    expect(resolveControlTarget(grouped, target).status).toBe('missing')
    const unlinked = unlinkModuleNode(authored, { trackId }, 'a')
    const remapped = unlinked.controlValues![0]!.target
    expect(value(unlinked, remapped)).toBe(0.7)
    expect(resolveControlTarget(unlinked, target).status).toBe('missing')
    expect(parseProject(serializeProject(unlinked)).ok).toBe(true)
    expect(remapControlTarget(target, { routes: [{ from: target, to: remapped }] }, unlinked)).toEqual({ status: 'mapped', target: remapped })
    expect(remapControlTarget(target, { nodes: { a: null } }, unlinked).status).toBe('missing')
  })
})

describe('mixer, master and remapping', () => {
  it('edits track pan/volume, return volume, master and send values with explicit missing sends', () => {
    const base = createDemoProject()
    const track = base.tracks[0]!
    const project = { ...base, tracks: [...base.tracks, { id: 'bus', name: 'Return', kind: 'return' as const, volume: 1, fx: base.master.fx }] }
    const owner = { kind: 'track' as const, trackId: track.id }
    for (const target of [
      { kind: 'mixer' as const, owner, control: 'volume' as const },
      { kind: 'mixer' as const, owner, control: 'pan' as const },
      { kind: 'mixer' as const, owner, control: 'send' as const, returnId: 'bus' },
      { kind: 'mixer' as const, owner: { kind: 'track' as const, trackId: 'bus' }, control: 'volume' as const },
      { kind: 'mixer' as const, owner: { kind: 'master' as const }, control: 'volume' as const },
    ]) {
      expect(value(editControlBase(project, target, 0.4).project, target)).toBe(0.4)
      expect(enumerateControlTargets(project)).toContainEqual(target)
    }
    const send: ControlTarget = { kind: 'mixer', owner, control: 'send', returnId: 'gone' }
    expect(resolveControlTarget(project, send).status).toBe('missing')
    expect(editControlBase(project, send, 0.4).project).toBe(project)
    expect(remapControlTarget(send, { returns: { gone: 'bus' } }, project)).toMatchObject({ status: 'mapped', target: { returnId: 'bus' } })
    expect(resolveControlTarget(project, { kind: 'mixer', owner: { kind: 'master' }, control: 'pan' }).status).toBe('incompatible')
  })

  it('uses explicit owner/node/module maps for duplication and asset insertion', () => {
    const { project, target } = setup()
    const source = project.tracks[0]!
    const copy = { ...source, id: 'copy' }
    const destination = { ...project, tracks: [...project.tracks, copy] }
    const result = remapControlTarget(target, { owners: { [source.id]: 'copy' } }, destination)
    expect(result).toMatchObject({ status: 'mapped', target: { owner: { trackId: 'copy' } } })
    expect(remapControlTarget(target, { modules: { outer: 'different' } }, destination).status).toBe('incompatible')
  })

  it('restores root values and remains editable after the final unlink', () => {
    const { project, target, trackId } = setup()
    let next = editControlBase(project, target, 0.7).project
    next = unlinkModuleNode(next, { trackId }, 'a')
    const route = next.controlValues![0]!.target
    if (route.kind !== 'graph') throw new Error('Graph target expected')
    next = unlinkModuleNode(next, { trackId }, route.path[0]!.nodeId)
    const root = next.controlValues![0]!.target
    expect(value(next, root)).toBe(0.7)
    const loaded = parseProject(serializeProject(next))
    if (!loaded.ok) throw new Error(loaded.error)
    expect(value(loaded.project, root)).toBe(0.7)
    const edited = editControlBase(loaded.project, root, 0.3).project
    expect(value(edited, root)).toBe(0.3)
    const roundTrip = parseProject(serializeProject(edited))
    expect(roundTrip.ok && roundTrip.project).toEqual(edited)
  })
})

it('keeps same node IDs in instrument and insert domains independent at the engine boundary', () => {
  const { project, trackId } = setup()
  const node = { ...createNode('control', 0, 0), id: 'same' }
  const base = editPatchAt(editPatchAt(project, { trackId }, () => ({ nodes: [node], connections: [] })), { trackId, graph: 'fx' }, () => ({ nodes: [node], connections: [] }))
  const target: ControlTarget = { kind: 'graph', owner: { kind: 'track', trackId }, domain: 'fx', path: [], nodeId: 'same', nodeType: 'control', paramId: 'value' }
  const next = editControlBase(base, target, 0.8).project
  expect(diffProject(base, next)).toEqual([{ type: 'track/setParam', graph: 'fx', trackId, nodeId: 'same', paramId: 'value', value: 0.8 }])
  expect(value(next, { ...target, domain: 'patch' })).not.toBe(0.8)
})


it('canonicalizes exposed module parameter aliases to the same target as panel controls', () => {
  const { project, trackId } = setup()
  const direct = editPatchAt(project, { trackId }, () => ({ nodes: [{ id: 'use', type: 'module', moduleId: 'leaf', x: 0, y: 0, params: {} }], connections: [] }))
  const target = controlTargetForGraphParam(direct, { kind: 'track', trackId }, 'patch', 'use', 'knob:value')!
  expect(target).toMatchObject({ path: [{ nodeId: 'use', moduleId: 'leaf' }], nodeId: 'knob', paramId: 'value' })
  const edited = editControlBase(direct, target, 0.9).project
  expect(value(edited, controlTargetForGraphParam(edited, { kind: 'track', trackId }, 'patch', 'use', 'knob:value')!)).toBe(0.9)
})


it('remaps a copied asset closure and reports every unavailable value', () => {
  const { project, target, trackId } = setup()
  const nodeIds = { a: 'copy-a', b: 'copy-b', child: 'copy-child', knob: 'copy-knob' }
  const moduleIds = { outer: 'copy-outer', leaf: 'copy-leaf' }
  const copyPatch = (patch: Patch): Patch => ({ ...patch, nodes: patch.nodes.map((node) => ({ ...node, id: nodeIds[node.id as keyof typeof nodeIds] ?? node.id, ...(node.moduleId ? { moduleId: moduleIds[node.moduleId as keyof typeof moduleIds] ?? node.moduleId } : {}) })) })
  const source = project.tracks[0]!
  if (source.kind !== 'instrument') throw new Error('Instrument expected')
  const destination = { ...project, modules: [...project.modules, ...project.modules.map((module) => ({ ...module, id: moduleIds[module.id as keyof typeof moduleIds], patch: copyPatch(module.patch) }))], tracks: [...project.tracks, { ...source, id: 'copy-track', patch: copyPatch(source.patch) }] }
  const result = remapControlValues([{ target, value: 0.8 }, { target: { ...target, nodeId: 'missing' }, value: 0.2 }], { owners: { [trackId]: 'copy-track' }, nodes: nodeIds, modules: moduleIds }, destination)
  expect(result.values).toHaveLength(1)
  expect(result.values[0]!.target).toMatchObject({ owner: { trackId: 'copy-track' }, nodeId: 'copy-knob', path: [{ nodeId: 'copy-a', moduleId: 'copy-outer' }, { nodeId: 'copy-child', moduleId: 'copy-leaf' }] })
  expect(result.unavailable).toEqual([{ target: { ...target, nodeId: 'missing' }, status: 'missing', reason: 'Node is missing' }])
})


it('remaps project MIDI bindings through grouping and unlinking without touching source selectors', () => {
  const { project, target, trackId } = setup()
  const mapping = { id: 'binding', deviceId: 'keyboard', deviceName: 'Keyboard', channel: 2, cc: 21, pickup: true, target }
  const authored = { ...project, midiMappings: [mapping] }
  const grouped = groupNodesAsModule(authored, { trackId }, ['a'])
  expect(resolveControlTarget(grouped, grouped.midiMappings![0]!.target).status).toBe('available')
  expect(grouped.midiMappings![0]).toMatchObject({ deviceId: 'keyboard', channel: 2, cc: 21 })
  const unlinked = unlinkModuleNode(authored, { trackId }, 'a')
  expect(resolveControlTarget(unlinked, unlinked.midiMappings![0]!.target).status).toBe('available')
  const loaded = parseProject(serializeProject(unlinked))
  expect(loaded.ok && loaded.project.midiMappings).toEqual(unlinked.midiMappings)
})
