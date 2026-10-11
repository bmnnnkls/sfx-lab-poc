import { describe, expect, it } from 'vitest'
import {
  type ModuleDefinition,
  type Patch,
  addNode,
  controlParamKey,
  createModuleUse,
  createNode,
  describeNode,
  flattenPatch,
  moduleControls,
  movePanelControl,
  noteGraphFrom,
  panelItems,
  setNodeParam,
  setPanelShow,
} from '.'

const empty: Patch = { nodes: [], connections: [] }

/** A module with a filter and, inside it, a control wired to the filter's cutoff, a pad, and a switch. */
const definition = (extra: Partial<ModuleDefinition> = {}): ModuleDefinition => {
  const inner = noteGraphFrom(
    [
      { id: 'f', type: 'filter', params: { cutoff: 900 } },
      { id: 'k', type: 'control', params: { value: 440, min: 20, max: 20000, curve: 1 } },
      { id: 'p', type: 'xyPad', params: { x: 0.25, y: 0.75 } },
      { id: 's', type: 'switch', params: { on: 1 } },
    ],
    ['k.out>f.param:cutoff'],
  )
  const named = { ...inner, nodes: inner.nodes.map((node) => (node.id === 'k' ? { ...node, name: 'Brightness', unit: 'Hz' } : node)) }
  return {
    id: 'm1',
    name: 'Voice',
    patch: named,
    inputs: [{ id: 'f:in', label: 'In', inner: { node: 'f', port: 'in' } }],
    outputs: [{ id: 'f:out', label: 'Out', inner: { node: 'f', port: 'out' } }],
    knobs: [],
    ...extra,
  }
}

const use = (id = 'u1', params: Record<string, number> = {}) => ({ ...createModuleUse(definition(), 0, 0), id, params })

describe('controls inside a module', () => {
  it('lists the control nodes of the module, with the parameters that carry their values', () => {
    expect(moduleControls(definition()).map(({ node, params }) => [node.id, params])).toEqual([
      ['k', ['value']],
      ['p', ['x', 'y']],
      ['s', ['on']],
    ])
  })

  it('leaves out the ones hidden from the panel, and the nodes that are not controls', () => {
    const hidden = definition()
    const patch = setPanelShow(hidden.patch, [], 's', false)
    expect(moduleControls({ ...hidden, patch }).map((c) => c.node.id)).toEqual(['k', 'p'])
  })

  it('a use has a parameter per value, named after the control, with its live range and unit, defaulting to the module\'s value', () => {
    const shape = describeNode(use(), [definition()])!
    expect(shape.params.map((spec) => spec.id)).toEqual(['k:value', 'p:x', 'p:y', 's:on'])
    const value = shape.params.find((spec) => spec.id === 'k:value')!
    expect(value).toMatchObject({ label: 'Brightness', min: 20, max: 20000, unit: 'Hz', default: 440, curve: 'log' })
    expect(shape.params.find((spec) => spec.id === 'p:y')).toMatchObject({ label: 'XY pad Y', default: 0.75 })
  })

  it('a control that is also a module knob keeps the knob and is not listed twice', () => {
    const withKnob = definition({ knobs: [{ id: 'k:value', label: 'Tone', node: 'k', param: 'value' }] })
    const params = describeNode(use(), [withKnob])!.params.filter((spec) => spec.id === 'k:value')
    expect(params).toHaveLength(1)
    expect(params[0]!.label).toBe('Tone')
  })

  it('flattening bakes in the use\'s own value, and leaves the module\'s where the use has not turned it', () => {
    const library = [definition()]
    const patch = [use('u1', { 'k:value': 3000 }), use('u2')].reduce(addNode, empty)
    const flat = flattenPatch(patch, library)
    const valueOf = (id: string, param: string) => flat.nodes.find((node) => node.id === id)!.params[param]
    expect(valueOf('u1/k', 'value')).toBe(3000)
    expect(valueOf('u2/k', 'value')).toBe(440)
    expect(valueOf('u1/p', 'x')).toBe(0.25)
  })

  it('two uses of one module keep different values for the same control', () => {
    const library = [definition()]
    const patch = [use('u1', { 'p:x': 0.9 }), use('u2', { 'p:x': 0.1 })].reduce(addNode, empty)
    const flat = flattenPatch(patch, library)
    expect([flat.nodes.find((n) => n.id === 'u1/p')!.params.x, flat.nodes.find((n) => n.id === 'u2/p')!.params.x]).toEqual([0.9, 0.1])
  })

  it('a value that is not a parameter of the control is ignored', () => {
    const flat = flattenPatch(addNode(empty, use('u1', { 'k:nonsense': 5, 'zz:value': 1 })), [definition()])
    expect(flat.nodes.find((n) => n.id === 'u1/k')!.params).not.toHaveProperty('nonsense')
  })
})

describe('the panel of a graph that uses a module', () => {
  const library = [definition()]
  const patch = [use('u1', { 'k:value': 3000 }), { ...createNode('control', 0, 0), id: 'own' }].reduce(addNode, empty)
  const items = panelItems(patch, library)

  it('lists its own controls first, then those of each module use', () => {
    expect(items.map((item) => item.node.id)).toEqual(['own', 'u1/k', 'u1/p', 'u1/s'])
    expect(items.map((item) => item.kind)).toEqual(['knob', 'knob', 'xy', 'switch'])
  })

  it('a module control is a stand-in with this use\'s values laid over the module\'s, named "Module: control"', () => {
    const brightness = items[1]!
    expect(brightness.node.params.value).toBe(3000)
    expect(brightness.node.params.min).toBe(20)
    expect(brightness.via).toEqual({ use: 'u1', inner: 'k' })
    expect(brightness.title).toBe('Voice: Brightness')
    expect(items[2]!.node.params).toMatchObject({ x: 0.25, y: 0.75 })
  })

  it('a control hidden inside the module is not on the parent\'s board at all', () => {
    const inner = definition()
    const hiddenInside = [{ ...inner, patch: setPanelShow(inner.patch, [], 'p', false) }]
    expect(panelItems(patch, hiddenInside).map((item) => item.node.id)).toEqual(['own', 'u1/k', 'u1/s'])
  })

  it('takes the module\'s own order and size', () => {
    const inner = definition()
    const reordered = [{ ...inner, patch: movePanelControl(inner.patch, [], 's', 0) }]
    expect(panelItems(patch, reordered).slice(1).map((item) => item.node.id)).toEqual(['u1/s', 'u1/k', 'u1/p'])
  })

  it('moving the graph\'s own controls ignores the module ones', () => {
    const second = addNode(patch, { ...createNode('control', 0, 0), id: 'own2' })
    const moved = movePanelControl(second, library, 'own2', 0)
    expect(panelItems(moved, library).map((item) => item.node.id)).toEqual(['own2', 'own', 'u1/k', 'u1/p', 'u1/s'])
    expect(movePanelControl(second, library, 'u1/k', 0)).toBe(second)
  })

  it('writing the use\'s own parameter changes what the item shows', () => {
    const turned = setNodeParam(patch, 'u1', controlParamKey('k', 'value'), 100)
    expect(panelItems(turned, library)[1]!.node.params.value).toBe(100)
  })

  it('a use of a module that is not in the library has no controls', () => {
    expect(panelItems(patch, []).map((item) => item.node.id)).toEqual(['own'])
  })
})
