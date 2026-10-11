import { describe, expect, it } from 'vitest'
import {
  type Patch,
  addNode,
  createBlankControl,
  createControlFor,
  createNode,
  createXyFor,
  movePanelControl,
  numberPanel,
  panelItems,
  removeNode,
  resizePanelControl,
  setNodeDisplay,
  setPanelShow,
  spotBelow,
} from '.'

const empty: Patch = { nodes: [], connections: [] }
const named = (type: string, id: string, extra: Record<string, unknown> = {}) => ({ ...createNode(type, 0, 0), id, ...extra })
const build = (...nodes: ReturnType<typeof named>[]): Patch => nodes.reduce(addNode, empty)
const ids = (patch: Patch) => panelItems(patch, []).map((item) => item.node.id)

describe('panelItems', () => {
  it('is the control nodes and nothing else, in patch order until something is ordered', () => {
    const patch = build(named('gain', 'g'), named('control', 'a'), named('filter', 'f'), named('switch', 's'), named('xyPad', 'p'))
    expect(ids(patch)).toEqual(['a', 's', 'p'])
  })

  it('says what each is: a knob, a slider (upright or lying down), a pad, a switch, a selector', () => {
    let patch = build(named('control', 'k'), named('control', 'v'), named('control', 'h'), named('xyPad', 'p'), named('switch', 's'), named('selector', 'c'))
    patch = setNodeDisplay(setNodeDisplay(patch, 'v', 'slider'), 'h', 'slider-horizontal')
    expect(panelItems(patch, []).map((item) => [item.node.id, item.kind, item.horizontal])).toEqual([
      ['k', 'knob', false], ['v', 'slider', false], ['h', 'slider', true], ['p', 'xy', false], ['s', 'switch', false], ['c', 'selector', false],
    ])
  })

  it('defaults: a pad is M, the rest S; shown unless hidden', () => {
    const items = panelItems(build(named('control', 'k'), named('xyPad', 'p')), [])
    expect(items.map((item) => [item.size, item.shown])).toEqual([['S', true], ['M', true]])
  })

  it('orders by `order` first, the rest after in patch order', () => {
    const patch = build(named('control', 'a'), named('control', 'b', { panel: { order: 1 } }), named('control', 'c', { panel: { order: 0 } }), named('control', 'd'))
    expect(ids(patch)).toEqual(['c', 'b', 'a', 'd'])
  })
})

describe('panel edits', () => {
  const patch = build(named('control', 'a'), named('control', 'b'), named('xyPad', 'p'))

  it('hide and show; the field disappears when nothing is left, the same patch when nothing changes', () => {
    const hidden = setPanelShow(patch, [], 'a', false)
    expect(panelItems(hidden, [])[0]!.shown).toBe(false)
    expect(setPanelShow(hidden, [], 'a', false)).toBe(hidden)
    const back = setPanelShow(hidden, [], 'a', true)
    expect('panel' in back.nodes[0]!).toBe(false)
    expect(setPanelShow(patch, [], 'a', true)).toBe(patch)
    expect(setPanelShow(patch, [], 'nope', false)).toBe(patch)
  })

  it('does nothing to a node that is not a control', () => {
    const withGain = addNode(patch, named('gain', 'g'))
    expect(setPanelShow(withGain, [], 'g', false)).toBe(withGain)
    expect(resizePanelControl(withGain, [], 'g', 'L')).toBe(withGain)
  })

  it('resizes; a kind\'s default size is stored as nothing', () => {
    const big = resizePanelControl(patch, [], 'a', 'L')
    expect(panelItems(big, [])[0]!.size).toBe('L')
    expect(resizePanelControl(big, [], 'a', 'L')).toBe(big)
    expect('panel' in resizePanelControl(big, [], 'a', 'S').nodes[0]!).toBe(false)
    expect('panel' in resizePanelControl(resizePanelControl(patch, [], 'p', 'L'), [], 'p', 'M').nodes[2]!).toBe(false)
  })

  it('size and visibility are kept apart', () => {
    const both = setPanelShow(resizePanelControl(patch, [], 'a', 'L'), [], 'a', false)
    expect(both.nodes[0]!.panel).toEqual({ size: 'L', show: false })
    expect(setPanelShow(both, [], 'a', true).nodes[0]!.panel).toEqual({ size: 'L' })
  })

  it('moves one control and numbers the whole board; clamps; same patch when it does not move', () => {
    const moved = movePanelControl(patch, [], 'p', 0)
    expect(ids(moved)).toEqual(['p', 'a', 'b'])
    expect(moved.nodes.map((node) => node.panel?.order)).toEqual([1, 2, 0])
    expect(ids(movePanelControl(moved, [], 'p', 99))).toEqual(['a', 'b', 'p'])
    expect(movePanelControl(moved, [], 'p', 0)).toBe(moved)
    expect(movePanelControl(patch, [], 'nope', 0)).toBe(patch)
    expect(movePanelControl(patch, [], 'a', Number.NaN)).toBe(patch)
  })

  it('a control added after a reorder lands at the end', () => {
    const moved = movePanelControl(patch, [], 'p', 0)
    expect(ids(addNode(moved, named('switch', 's')))).toEqual(['p', 'a', 'b', 's'])
  })

  it('removing a node takes it off the board and leaves the rest in order', () => {
    expect(ids(removeNode(movePanelControl(patch, [], 'p', 0), 'a'))).toEqual(['p', 'b'])
  })

  it('numberPanel gives every control its place and is a no-op once done', () => {
    const numbered = numberPanel(patch, [])
    expect(numbered.nodes.map((node) => node.panel?.order)).toEqual([0, 1, 2])
    expect(numberPanel(numbered, [])).toBe(numbered)
  })
})

describe('making controls', () => {
  it('a blank control of each kind, with nothing wired', () => {
    let patch = empty
    const kinds = ['knob', 'slider', 'slider-horizontal', 'xy', 'switch', 'selector', 'led', 'display', 'bar'] as const
    for (const kind of kinds) patch = createBlankControl(patch, kind, { x: 10, y: 20 }).patch
    expect(patch.nodes.map((node) => node.type)).toEqual(['control', 'control', 'control', 'xyPad', 'switch', 'selector', 'led', 'display', 'bar'])
    expect(panelItems(patch, []).map((item) => `${item.kind}${item.horizontal ? '-h' : ''}`)).toEqual(['knob', 'slider', 'slider-h', 'xy', 'switch', 'selector', 'led', 'display', 'bar'])
    expect(patch.connections).toEqual([])
  })

  it('an XY pad for two parameters takes their ranges and values and is wired to both sockets', () => {
    const filter = named('filter', 'f', { params: { ...createNode('filter', 0, 0).params, cutoff: 900, resonance: 4 } })
    const made = createXyFor(build(filter), [], { node: 'f', port: 'cutoff' }, { node: 'f', port: 'resonance' }, { at: { x: 0, y: 0 }, id: 'pad' })!
    const pad = made.patch.nodes.find((node) => node.id === 'pad')!
    expect(pad).toMatchObject({ type: 'xyPad', name: 'Cutoff / Res', unit: 'Hz' })
    expect(pad.params).toMatchObject({ x: 900, xMin: 20, xMax: 20000, xCurve: 1, y: 4, yMin: 0.1, yMax: 20 })
    expect(made.patch.connections.map((c) => `${c.from.port}>${c.to.port}`).sort()).toEqual(['x>param:cutoff', 'y>param:resonance'])
  })

  it('an XY pad is refused for the same parameter twice, an enum, or one that is already driven', () => {
    const patch = build(named('filter', 'f'))
    const at = { x: 0, y: 0 }
    expect(createXyFor(patch, [], { node: 'f', port: 'cutoff' }, { node: 'f', port: 'cutoff' }, { at })).toBeUndefined()
    expect(createXyFor(patch, [], { node: 'f', port: 'cutoff' }, { node: 'f', port: 'mode' }, { at })).toBeUndefined()
    const driven = createControlFor(patch, [], 'f', 'resonance', { at })!.patch
    expect(createXyFor(driven, [], { node: 'f', port: 'cutoff' }, { node: 'f', port: 'resonance' }, { at })).toBeUndefined()
  })

  it('spotBelow puts new nodes in a row under everything, wrapping', () => {
    const patch = addNode(empty, { ...createNode('gain', 0, 300), id: 'g' })
    expect(spotBelow(patch, 0)).toEqual({ x: 40, y: 480 })
    expect(spotBelow(patch, 1).x).toBeGreaterThan(spotBelow(patch, 0).x)
    expect(spotBelow(patch, 6)).toEqual({ x: 40, y: 600 })
  })
})
