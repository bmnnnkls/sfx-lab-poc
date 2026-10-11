import { describe, expect, it } from 'vitest'
import { createDefaultPatch } from './default-patch'
import { addNode, connect, createNode, removeNode, setNodeParam } from './edit'
import { containsModule, flattenPatch, unlinkModuleUse } from './flatten'
import { createModuleUse, groupIntoModule, pruneModuleInterface, pruneModuleUses } from './group-module'
import { exposeKnob, exposePort, hideKnob, renameModule, setModulePatch } from './module-edit'
import { MODULE_NODE_TYPE, type ModuleDefinition } from './module-types'
import { describeNode } from './node-shape'
import type { Patch } from './types'

const nodeOf = (patch: Patch, type: string) => patch.nodes.find((node) => node.type === type)!
const wiresOf = (patch: Patch) =>
  patch.connections.map(({ from, to }) => `${from.node}.${from.port}>${to.node}.${to.port}`).sort()

/** The default patch with its oscillator and filter grouped into a module. */
const grouped = () => {
  const patch = createDefaultPatch()
  const result = groupIntoModule(patch, [nodeOf(patch, 'oscillator').id, nodeOf(patch, 'filter').id], 'Voice core', [])!
  return { original: patch, ...result }
}

describe('grouping nodes into a module', () => {
  it('turns the connections that crossed the selection edge into ports', () => {
    const { module } = grouped()
    expect(module.inputs.map((port) => port.label)).toEqual(['Freq'])
    expect(module.outputs.map((port) => port.label)).toEqual(['Out'])
    expect(module.patch.nodes).toHaveLength(2)
    expect(module.patch.connections).toHaveLength(1) // oscillator -> filter stays inside
    expect(module.knobs).toEqual([])
  })

  it('replaces the nodes by one use, wired exactly where they were', () => {
    const { patch, original, use } = grouped()
    expect(patch.nodes).toHaveLength(original.nodes.length - 1)
    expect(patch.nodes.filter((node) => node.type === MODULE_NODE_TYPE)).toEqual([use])
    expect(patch.connections).toHaveLength(original.connections.length - 1)
  })

  it('flattening gives back the original behaviour: same nodes by type, same wiring shape', () => {
    const { patch, original, module } = grouped()
    const flat = flattenPatch(patch, [module])
    expect(flat.nodes.map((node) => node.type).sort()).toEqual(original.nodes.map((node) => node.type).sort())
    expect(flat.connections).toHaveLength(original.connections.length)

    const typeOf = new Map(flat.nodes.map((node) => [node.id, node.type]))
    const shape = (p: Patch, types: Map<string, string>) =>
      p.connections.map(({ from, to }) => `${types.get(from.node)}.${from.port}>${types.get(to.node)}.${to.port}`).sort()
    const originalTypes = new Map(original.nodes.map((node) => [node.id, node.type]))
    expect(shape(flat, typeOf)).toEqual(shape(original, originalTypes))
  })

  it('does nothing for an empty selection', () => {
    expect(groupIntoModule(createDefaultPatch(), [], 'x', [])).toBeNull()
  })

  it('disambiguates ports that would carry the same label', () => {
    let patch: Patch = { nodes: [], connections: [] }
    const source = createNode('note', 0, 0)
    const a = createNode('filter', 0, 0)
    const b = createNode('filter', 0, 0)
    patch = [source, a, b].reduce(addNode, patch)
    patch = connect(patch, { node: source.id, port: 'frequency' }, { node: a.id, port: 'in' })
    patch = connect(patch, { node: source.id, port: 'frequency' }, { node: b.id, port: 'in' })
    const { module } = groupIntoModule(patch, [a.id, b.id], 'Pair', [])!
    expect(module.inputs.map((port) => port.label)).toEqual(['Filter In', 'Filter In'])
  })
})

describe('using a module', () => {
  it('a use describes itself from the definition: ports and exposed knobs', () => {
    const { module, use } = grouped()
    const filter = nodeOf(module.patch, 'filter')
    const withKnob = exposeKnob(module, filter.id, 'cutoff', 'Brightness')
    const shape = describeNode(use, [withKnob])!
    expect(shape.label).toBe('Voice core')
    expect(shape.inputs.map((p) => p.id)).toEqual(module.inputs.map((p) => p.id))
    expect(shape.params).toHaveLength(1)
    expect(shape.params[0]).toMatchObject({ label: 'Brightness', min: 20, max: 20000, default: filter.params.cutoff })
    expect(describeNode(use, [])).toBeUndefined() // not in the library
  })

  it('knob settings on a use reach the matching inner node when flattened', () => {
    const { patch, module, use } = grouped()
    const filter = nodeOf(module.patch, 'filter')
    const withKnob = exposeKnob(module, filter.id, 'cutoff', 'Brightness')
    const tuned = setNodeParam(patch, use.id, `${filter.id}:cutoff`, 5000)
    const flat = flattenPatch(tuned, [withKnob])
    expect(nodeOf(flat, 'filter').params.cutoff).toBe(5000)
    expect(nodeOf(flat, 'filter').id).toBe(`${use.id}/${filter.id}`)
    // Another use keeps its own setting.
    const second = createModuleUse(withKnob, 0, 0)
    const both = flattenPatch({ nodes: [...tuned.nodes, second], connections: tuned.connections }, [withKnob])
    expect(both.nodes.filter((node) => node.type === 'filter').map((node) => node.params.cutoff).sort()).toEqual([
      filter.params.cutoff,
      5000,
    ])
  })

  it('editing the definition changes every use', () => {
    const { module } = grouped()
    const a = createModuleUse(module, 0, 0)
    const b = createModuleUse(module, 200, 0)
    const filter = nodeOf(module.patch, 'filter')
    const edited = setModulePatch(module, setNodeParam(module.patch, filter.id, 'cutoff', 321))
    const flat = flattenPatch({ nodes: [a, b], connections: [] }, [edited])
    expect(flat.nodes.filter((node) => node.type === 'filter').map((node) => node.params.cutoff)).toEqual([321, 321])
  })

  it('returns the same patch object when there is nothing to expand', () => {
    const patch = createDefaultPatch()
    expect(flattenPatch(patch, [])).toBe(patch)
  })

  it('wires to ports the module does not have are dropped, and unknown modules vanish', () => {
    const { patch, module, use } = grouped()
    const without = { ...module, inputs: [] }
    const flat = flattenPatch(patch, [without])
    const note = nodeOf(patch, 'note')
    expect(flat.connections.some((c) => c.from.node === note.id && c.to.node.startsWith(`${use.id}/`))).toBe(false)

    const missing = flattenPatch(patch, [])
    expect(missing.nodes.some((node) => node.type === MODULE_NODE_TYPE)).toBe(false)
    expect(missing.connections.every((c) => missing.nodes.some((n) => n.id === c.from.node) && missing.nodes.some((n) => n.id === c.to.node))).toBe(true)
  })

  it('can connect to the ports of a use only when the library is given', () => {
    const { patch, module, use } = grouped()
    const note = nodeOf(patch, 'note')
    const empty = { ...patch, connections: [] }
    const port = module.inputs[0]!.id
    expect(connect(empty, { node: note.id, port: 'frequency' }, { node: use.id, port }).connections).toHaveLength(0)
    expect(connect(empty, { node: note.id, port: 'frequency' }, { node: use.id, port }, { modules: [module] }).connections).toHaveLength(1)
  })
})

describe('nesting', () => {
  const inner: ModuleDefinition = grouped().module

  it('a module can contain uses of another module, and flattening expands all the way down', () => {
    const wrapper = groupIntoModule(
      { nodes: [createModuleUse(inner, 0, 0)], connections: [] },
      [],
      'unused',
      [inner],
    )
    expect(wrapper).toBeNull()
    const use = createModuleUse(inner, 0, 0)
    const outer = groupIntoModule({ nodes: [use], connections: [] }, [use.id], 'Outer', [inner])!
    const flat = flattenPatch({ nodes: [createModuleUse(outer.module, 0, 0)], connections: [] }, [inner, outer.module])
    expect(flat.nodes.map((node) => node.type).sort()).toEqual(['filter', 'oscillator'])
    expect(flat.nodes.every((node) => node.id.split('/').length === 3)).toBe(true)
  })

  it('knobs can point through a nested module', () => {
    const filter = nodeOf(inner.patch, 'filter')
    const withKnob = exposeKnob(inner, filter.id, 'cutoff', 'Cutoff')
    const use = createModuleUse(withKnob, 0, 0)
    const outer = groupIntoModule({ nodes: [use], connections: [] }, [use.id], 'Outer', [withKnob])!
    const outerWithKnob = exposeKnob(outer.module, use.id, `${filter.id}:cutoff`, 'Tone')
    const top = { ...createModuleUse(outerWithKnob, 0, 0), params: { [`${use.id}:${filter.id}:cutoff`]: 777 } }
    const flat = flattenPatch({ nodes: [top], connections: [] }, [withKnob, outerWithKnob])
    expect(nodeOf(flat, 'filter').params.cutoff).toBe(777)
  })

  it('detects a module that would end up inside itself', () => {
    const use = createModuleUse(inner, 0, 0)
    const outer = groupIntoModule({ nodes: [use], connections: [] }, [use.id], 'Outer', [inner])!.module
    expect(containsModule([inner, outer], outer.id, inner.id)).toBe(true) // outer holds inner
    expect(containsModule([inner, outer], inner.id, outer.id)).toBe(false)
    expect(containsModule([inner, outer], inner.id, inner.id)).toBe(true)
  })

  it('a module that contains itself is cut off instead of expanding forever', () => {
    const loop: ModuleDefinition = {
      id: 'loop',
      name: 'Loop',
      inputs: [],
      outputs: [],
      knobs: [],
      patch: { nodes: [createNode('oscillator', 0, 0), { ...createModuleUse({ id: 'loop' } as ModuleDefinition, 0, 0) }], connections: [] },
    }
    const flat = flattenPatch({ nodes: [createModuleUse(loop, 0, 0)], connections: [] }, [loop])
    expect(flat.nodes.every((node) => node.type !== MODULE_NODE_TYPE)).toBe(true)
  })
})

describe('unlinking a use', () => {
  it('replaces it with an independent copy that is wired the same way', () => {
    const { patch, module, use } = grouped()
    const copy = unlinkModuleUse(patch, use.id, [module])
    expect(copy.nodes.some((node) => node.type === MODULE_NODE_TYPE)).toBe(false)
    expect(copy.nodes.map((node) => node.type).sort()).toEqual(createDefaultPatch().nodes.map((node) => node.type).sort())
    // Fresh ids, so a second unlink of another use does not collide.
    const second = unlinkModuleUse({ nodes: [createModuleUse(module, 0, 0)], connections: [] }, [...patch.nodes.filter((n) => n.type === MODULE_NODE_TYPE)][0]!.id, [module])
    expect(second).toBeDefined()
    const ids = new Set(copy.nodes.map((node) => node.id))
    expect(ids.size).toBe(copy.nodes.length)
    for (const node of module.patch.nodes) expect(ids.has(node.id)).toBe(false)
  })
})

describe('keeping interfaces and uses consistent', () => {
  it('deleting an inner node removes the ports and knobs that pointed at it', () => {
    const { module } = grouped()
    const filter = nodeOf(module.patch, 'filter')
    const withKnob = exposeKnob(module, filter.id, 'cutoff', 'Tone')
    const without = setModulePatch(withKnob, removeNode(withKnob.patch, filter.id))
    const pruned = pruneModuleInterface(without, [])
    expect(pruned.outputs).toHaveLength(0)
    expect(pruned.knobs).toHaveLength(0)
    expect(pruned.inputs).toHaveLength(1) // the oscillator's freq is still there
    expect(pruneModuleInterface(module, [])).toBe(module)
  })

  it('uses lose connections and values for things the module no longer exposes', () => {
    const { patch, module, use } = grouped()
    const filter = nodeOf(module.patch, 'filter')
    const withKnob = exposeKnob(module, filter.id, 'cutoff', 'Tone')
    const tuned = setNodeParam(patch, use.id, `${filter.id}:cutoff`, 900)
    expect(pruneModuleUses(tuned, [withKnob])).toBe(tuned)

    const hidden = hideKnob(withKnob, `${filter.id}:cutoff`)
    expect(Object.keys(pruneModuleUses(tuned, [hidden]).nodes.find((n) => n.id === use.id)!.params)).toEqual([])

    const noOutputs = { ...hidden, outputs: [] }
    expect(pruneModuleUses(tuned, [noOutputs]).connections.length).toBe(tuned.connections.length - 1)
  })

  it('exposing a port twice is a no-op, and renaming keeps the rest', () => {
    const { module } = grouped()
    const filter = nodeOf(module.patch, 'filter')
    const once = exposePort(module, 'inputs', { node: filter.id, port: 'cutoff' }, 'Cutoff CV')
    expect(once.inputs).toHaveLength(2)
    expect(exposePort(once, 'inputs', { node: filter.id, port: 'cutoff' }, 'again')).toBe(once)
    expect(renameModule(module, 'Wobble').patch).toBe(module.patch)
    expect(wiresOf(module.patch)).toHaveLength(1)
  })
})
