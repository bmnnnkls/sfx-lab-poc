import { describe, expect, it } from 'vitest'
import { type Patch, addNode, createControlFor, createNode, describeNode, nodeTitles, resolveSpec, setNodeDisplay, setNodeName, setNodeParam, setNodeUnit } from '.'

const empty: Patch = { nodes: [], connections: [] }
const withFilter = () => {
  const filter = { ...createNode('filter', 400, 100), id: 'f' }
  return { filter, patch: addNode(empty, filter) }
}

describe('createControlFor', () => {
  it('adds a control set up from the parameter and wires it into the socket, in one edit', () => {
    const { patch } = withFilter()
    const tuned = setNodeParam(patch, 'f', 'cutoff', 700)
    const made = createControlFor(tuned, [], 'f', 'cutoff', { at: { x: 100, y: 120 }, id: 'k' })!
    const control = made.patch.nodes.find((node) => node.id === 'k')!
    expect(made.controlId).toBe('k')
    expect(control).toMatchObject({ type: 'control', name: 'Cutoff', unit: 'Hz', x: 100, y: 120 })
    expect(control.params).toMatchObject({ value: 700, min: 20, max: 20000, default: 2000, step: 0, curve: 1 })
    expect(made.patch.connections).toHaveLength(1)
    expect(made.patch.connections[0]).toMatchObject({ from: { node: 'k', port: 'out' }, to: { node: 'f', port: 'param:cutoff' } })
    expect(made.patch.nodes.find((node) => node.id === 'f')!.params.cutoff).toBe(700) // the stored value stays
  })

  it('a linear parameter gets a straight curve, a stepped one keeps its step, a slider is remembered', () => {
    const gain = { ...createNode('gain', 0, 0), id: 'g' }
    const made = createControlFor(addNode(empty, gain), [], 'g', 'gain', { at: { x: 0, y: 0 }, display: 'slider', id: 'k' })!
    const control = made.patch.nodes.find((node) => node.id === 'k')!
    expect(control.params).toMatchObject({ min: 0, max: 2, curve: 0, value: 1, default: 1 })
    expect(control.display).toBe('slider')
    const sampler = { ...createNode('sampler', 0, 0), id: 's' }
    const root = createControlFor(addNode(empty, sampler), [], 's', 'root', { at: { x: 0, y: 0 }, id: 'r' })!
    expect(root.patch.nodes.find((node) => node.id === 'r')!.params).toMatchObject({ min: 0, max: 127, step: 1, value: 60 })
    expect('display' in root.patch.nodes.find((node) => node.id === 'r')!).toBe(false) // a knob is the default
  })

  it('the control it makes plays the same value: replacing the parameter with it changes nothing', () => {
    const { patch } = withFilter()
    const made = createControlFor(patch, [], 'f', 'resonance', { at: { x: 0, y: 0 }, id: 'k' })!
    const control = made.patch.nodes.find((node) => node.id === 'k')!
    expect(control.params.value).toBe(patch.nodes[0]!.params.resonance)
  })

  it('refuses (the same patch) an enum, a missing parameter, a missing node and a parameter that is already wired', () => {
    const { patch } = withFilter()
    const at = { x: 0, y: 0 }
    expect(createControlFor(patch, [], 'f', 'mode', { at })).toBeUndefined()
    expect(createControlFor(patch, [], 'f', 'nonsense', { at })).toBeUndefined()
    expect(createControlFor(patch, [], 'nobody', 'cutoff', { at })).toBeUndefined()
    const once = createControlFor(patch, [], 'f', 'cutoff', { at })!.patch
    expect(createControlFor(once, [], 'f', 'cutoff', { at })).toBeUndefined()
    expect(createControlFor(once, [], 'f', 'resonance', { at })).toBeDefined() // another parameter is fine
  })

  it('a control node has no sockets, so nothing can be made for it', () => {
    const control = { ...createNode('control', 0, 0), id: 'c' }
    expect(createControlFor(addNode(empty, control), [], 'c', 'value', { at: { x: 0, y: 0 } })).toBeUndefined()
  })
})

describe('resolveSpec', () => {
  it('gives a control its own range, step, curve and unit', () => {
    const control = { ...createNode('control', 0, 0), unit: 'Hz', params: { ...createNode('control', 0, 0).params, min: 20, max: 20000, curve: 2, step: 5 } }
    const value = describeNode(control)!.params.find((spec) => spec.id === 'value')!
    expect(resolveSpec(control, value)).toMatchObject({ min: 20, max: 20000, step: 5, curve: 'exp', unit: 'Hz' })
    const min = describeNode(control)!.params.find((spec) => spec.id === 'min')!
    expect(resolveSpec(control, min).unit).toBe('Hz')
  })

  it('a control\'s default is its own default setting', () => {
    const base = createNode('control', 0, 0)
    const control = { ...base, params: { ...base.params, default: 0.9 } }
    expect(resolveSpec(control, describeNode(control)!.params.find((spec) => spec.id === 'value')!).default).toBe(0.9)
  })

  it('an XY pad takes its y unit from unitY', () => {
    const pad = { ...createNode('xyPad', 0, 0), unit: 'Hz', unitY: '%' }
    const shape = describeNode(pad)!
    expect(resolveSpec(pad, shape.params.find((spec) => spec.id === 'x')!).unit).toBe('Hz')
    expect(resolveSpec(pad, shape.params.find((spec) => spec.id === 'y')!).unit).toBe('%')
  })

  it('leaves an ordinary spec as it is', () => {
    const filter = createNode('filter', 0, 0)
    const cutoff = describeNode(filter)!.params.find((spec) => spec.id === 'cutoff')!
    expect(resolveSpec(filter, cutoff)).toBe(cutoff)
  })
})

describe('unit and display edits', () => {
  const control = { ...createNode('control', 0, 0), id: 'c' }
  const patch = addNode(empty, control)

  it('sets, trims, caps and clears a unit; the same patch when nothing changes', () => {
    const set = setNodeUnit(patch, 'c', 'unit', '  Hz ')
    expect(set.nodes[0]!.unit).toBe('Hz')
    expect(setNodeUnit(set, 'c', 'unit', 'Hz')).toBe(set)
    expect(setNodeUnit(patch, 'c', 'unit', 'x'.repeat(40)).nodes[0]!.unit).toHaveLength(16)
    expect('unit' in setNodeUnit(set, 'c', 'unit', '').nodes[0]!).toBe(false)
    expect(setNodeUnit(patch, 'c', 'unit', '')).toBe(patch)
    expect(setNodeUnit(patch, 'nobody', 'unit', 'Hz')).toBe(patch)
  })

  it('sets a display; a knob is stored as nothing', () => {
    const slider = setNodeDisplay(patch, 'c', 'slider')
    expect(slider.nodes[0]!.display).toBe('slider')
    expect(setNodeDisplay(slider, 'c', 'slider')).toBe(slider)
    expect('display' in setNodeDisplay(slider, 'c', 'knob').nodes[0]!).toBe(false)
    expect(setNodeDisplay(patch, 'c', 'knob')).toBe(patch)
  })
})

describe('nodeTitles', () => {
  it('numbers nodes that share a name, in patch order, and leaves single ones alone', () => {
    const a = createNode('oscillator', 500, 500)
    const f = createNode('filter', 0, 0)
    const b = createNode('oscillator', 0, 0)
    const patch = [a, f, b].reduce(addNode, empty)
    const titles = nodeTitles(patch, [])
    expect(titles.get(a.id)).toBe('Oscillator 1')
    expect(titles.get(b.id)).toBe('Oscillator 2')
    expect(titles.get(f.id)).toBe('Filter')
  })

  it('a name replaces the title and does not renumber the others', () => {
    const a = createNode('oscillator', 0, 0)
    const b = createNode('oscillator', 0, 0)
    const patch = setNodeName([a, b].reduce(addNode, empty), a.id, 'Lead')
    const titles = nodeTitles(patch, [])
    expect(titles.get(a.id)).toBe('Lead')
    expect(titles.get(b.id)).toBe('Oscillator 2')
  })
})
