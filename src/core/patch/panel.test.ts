import { describe, expect, it } from 'vitest'
import {
  MAX_PANEL_CONTROLS,
  type Patch,
  type PanelControl,
  addControl,
  addNode,
  buildPanel,
  connect,
  createDefaultPatch,
  createNode,
  disconnect,
  flattenPatch,
  moveControl,
  moveNode,
  prunePanel,
  rebindControl,
  removeControl,
  removeNode,
  renameControl,
  resizeControl,
  setControlOrientation,
  setNodeBypassed,
  setNodeParam,
  setNodeSample,
  setNodeStereo,
  setNodeTrack,
} from '.'

const filter = createNode('filter', 0, 0)
const osc = createNode('oscillator', 200, 0)
const base: Patch = { nodes: [filter, osc], connections: [] }
const cutoff = { node: filter.id, param: 'cutoff' }
const resonance = { node: filter.id, param: 'resonance' }
const mode = { node: filter.id, param: 'mode' }
const freq = { node: osc.id, param: 'frequency' }

const controlsOf = (patch: Patch): readonly PanelControl[] => patch.panel ?? []

describe('addControl', () => {
  it('adds a knob at the end with the parameter name as its label and a size', () => {
    const next = addControl(base, [], { kind: 'knob', bind: cutoff })
    expect(controlsOf(next)).toHaveLength(1)
    expect(controlsOf(next)[0]).toMatchObject({ kind: 'knob', label: 'Cutoff', bind: cutoff, size: 'S' })
    const again = addControl(next, [], { kind: 'slider', bind: freq, orientation: 'horizontal' })
    expect(controlsOf(again).map((control) => control.bind)).toEqual([cutoff, freq])
    expect(controlsOf(again)[1]).toMatchObject({ orientation: 'horizontal' })
  })

  it('an XY pad takes two different numeric parameters, named after both, and is bigger', () => {
    const next = addControl(base, [], { kind: 'xy', bind: cutoff, bindY: resonance })
    expect(controlsOf(next)[0]).toMatchObject({ kind: 'xy', label: 'Cutoff / Res', bindY: resonance, size: 'M' })
  })

  it('uses a given label, trimmed', () => {
    const next = addControl(base, [], { kind: 'knob', bind: cutoff, label: '  Brightness ' })
    expect(controlsOf(next)[0]?.label).toBe('Brightness')
  })

  it('refuses what does not fit, returning the same patch', () => {
    expect(addControl(base, [], { kind: 'knob', bind: { node: 'nope', param: 'cutoff' } })).toBe(base)
    expect(addControl(base, [], { kind: 'knob', bind: { node: filter.id, param: 'nope' } })).toBe(base)
    expect(addControl(base, [], { kind: 'knob', bind: mode })).toBe(base) // an enum wants a selector
    expect(addControl(base, [], { kind: 'selector', bind: cutoff })).toBe(base) // a number is not a selector
    expect(addControl(base, [], { kind: 'xy', bind: cutoff })).toBe(base) // a pad needs both axes
    expect(addControl(base, [], { kind: 'xy', bind: cutoff, bindY: cutoff })).toBe(base)
    expect(addControl(base, [], { kind: 'xy', bind: cutoff, bindY: mode })).toBe(base)
    expect(addControl(base, [], { kind: 'knob', bind: cutoff, bindY: resonance })).toBe(base) // only a pad has a Y
  })

  it('takes a selector for an enum parameter', () => {
    expect(controlsOf(addControl(base, [], { kind: 'selector', bind: mode }))[0]).toMatchObject({ kind: 'selector', label: 'Mode' })
  })

  it('stops at the limit', () => {
    let patch = base
    for (let i = 0; i < MAX_PANEL_CONTROLS + 5; i++) patch = addControl(patch, [], { kind: 'knob', bind: cutoff })
    expect(controlsOf(patch)).toHaveLength(MAX_PANEL_CONTROLS)
  })
})

describe('editing controls', () => {
  const withTwo = addControl(addControl(base, [], { kind: 'knob', bind: cutoff }), [], { kind: 'slider', bind: freq })
  const [first, second] = controlsOf(withTwo) as [PanelControl, PanelControl]

  it('removes one, and an emptied panel is no panel at all', () => {
    const one = removeControl(withTwo, first.id)
    expect(controlsOf(one).map((control) => control.id)).toEqual([second.id])
    const none = removeControl(one, second.id)
    expect('panel' in none).toBe(false)
    expect(removeControl(withTwo, 'missing')).toBe(withTwo)
  })

  it('moves a control, clamped to the ends, and a no-op is the same patch', () => {
    expect(controlsOf(moveControl(withTwo, first.id, 1)).map((control) => control.id)).toEqual([second.id, first.id])
    expect(controlsOf(moveControl(withTwo, first.id, 99)).map((control) => control.id)).toEqual([second.id, first.id])
    expect(controlsOf(moveControl(withTwo, second.id, -5)).map((control) => control.id)).toEqual([second.id, first.id])
    expect(moveControl(withTwo, first.id, 0)).toBe(withTwo)
    expect(moveControl(withTwo, 'missing', 0)).toBe(withTwo)
  })

  it('renames (trimmed; blank refused) and resizes', () => {
    expect(controlsOf(renameControl(withTwo, first.id, ' Tone '))[0]?.label).toBe('Tone')
    expect(renameControl(withTwo, first.id, '   ')).toBe(withTwo)
    expect(renameControl(withTwo, first.id, first.label)).toBe(withTwo)
    expect(controlsOf(resizeControl(withTwo, first.id, 'L'))[0]?.size).toBe('L')
    expect(resizeControl(withTwo, first.id, first.size)).toBe(withTwo)
  })

  it('sets the orientation of a slider only; vertical is stored as nothing', () => {
    const horizontal = setControlOrientation(withTwo, second.id, 'horizontal')
    expect(controlsOf(horizontal)[1]?.orientation).toBe('horizontal')
    const back = setControlOrientation(horizontal, second.id, 'vertical')
    expect(controlsOf(back)[1] && 'orientation' in controlsOf(back)[1]!).toBe(false)
    expect(setControlOrientation(withTwo, second.id, 'vertical')).toBe(withTwo)
    expect(setControlOrientation(withTwo, first.id, 'horizontal')).toBe(withTwo) // a knob has none
  })

  it('rebinds to another parameter of the same kind, refuses a bad one', () => {
    const next = rebindControl(withTwo, [], first.id, resonance)
    expect(controlsOf(next)[0]?.bind).toEqual(resonance)
    expect(rebindControl(withTwo, [], first.id, mode)).toBe(withTwo)
    expect(rebindControl(withTwo, [], first.id, first.bind)).toBe(withTwo)
    expect(rebindControl(withTwo, [], first.id, resonance, cutoff)).toBe(withTwo) // a knob cannot gain a Y
  })

  it('rebinds the two axes of a pad together', () => {
    const pad = addControl(base, [], { kind: 'xy', bind: cutoff, bindY: resonance })
    const id = controlsOf(pad)[0]!.id
    const next = rebindControl(pad, [], id, freq, cutoff)
    expect(controlsOf(next)[0]).toMatchObject({ bind: freq, bindY: cutoff })
    expect(rebindControl(pad, [], id, cutoff, resonance)).toBe(pad)
  })
})

describe('buildPanel', () => {
  it('makes a control for every parameter in reading order, a selector for enums', () => {
    const left = createNode('filter', 0, 0)
    const right = createNode('oscillator', 400, 0)
    const lower = createNode('gain', 0, 300)
    const patch = buildPanel({ nodes: [lower, right, left], connections: [] }, [])
    const bound = controlsOf(patch).map((control) => `${control.bind.node === left.id ? 'filter' : control.bind.node === right.id ? 'osc' : 'gain'}:${control.bind.param}:${control.kind}`)
    expect(bound.slice(0, 4)).toEqual(['filter:mode:selector', 'filter:cutoff:knob', 'filter:resonance:knob', 'filter:cvAmount:knob'])
    expect(bound.filter((entry) => entry.startsWith('osc'))[0]).toBe('osc:waveform:selector')
    expect(bound.findIndex((entry) => entry.startsWith('osc'))).toBeLessThan(bound.findIndex((entry) => entry.startsWith('gain')))
    expect(controlsOf(patch).length).toBeGreaterThan(8)
  })

  it('only adds what is missing, so running it again changes nothing', () => {
    const once = buildPanel(base, [])
    expect(buildPanel(once, [])).toBe(once)
    const curated = addControl(base, [], { kind: 'xy', bind: cutoff, bindY: resonance, label: 'Tone' })
    const filled = buildPanel(curated, [])
    expect(controlsOf(filled)[0]?.label).toBe('Tone')
    const boundCutoff = controlsOf(filled).filter((control) => control.bind.param === 'cutoff' || control.bindY?.param === 'cutoff')
    expect(boundCutoff).toHaveLength(1) // the pad covers it
  })

  it('adds the parameters of nodes added later', () => {
    const once = buildPanel(base, [])
    const later = createNode('gain', 0, 400)
    const grown = buildPanel(addNode(once, later), [])
    expect(controlsOf(grown).some((control) => control.bind.node === later.id)).toBe(true)
    expect(controlsOf(grown).slice(0, controlsOf(once).length)).toEqual(controlsOf(once))
  })

  it('leaves a patch with nothing to bind alone', () => {
    const empty: Patch = { nodes: [], connections: [] }
    expect(buildPanel(empty, [])).toBe(empty)
  })
})

describe('keeping the panel consistent', () => {
  const panelled = addControl(
    addControl(addControl(base, [], { kind: 'knob', bind: cutoff }), [], { kind: 'slider', bind: freq }),
    [],
    { kind: 'xy', bind: resonance, bindY: freq },
  )

  it('removing a node removes the controls on it, a pad whole', () => {
    const next = removeNode(panelled, osc.id)
    expect(controlsOf(next).map((control) => control.kind)).toEqual(['knob'])
    expect(removeNode(panelled, filter.id).panel?.map((control) => control.kind)).toEqual(['slider'])
  })

  it('removing a node nobody binds changes no panel', () => {
    const other = createNode('gain', 0, 0)
    const next = removeNode(addNode(panelled, other), other.id)
    expect(next.panel).toBe(panelled.panel)
  })

  it('prunes controls whose parameter vanished and keeps the same patch when all fit', () => {
    expect(prunePanel(panelled, [])).toBe(panelled)
    const broken: Patch = { ...panelled, panel: [...controlsOf(panelled), { id: 'x', kind: 'knob', label: 'Ghost', bind: { node: 'gone', param: 'p' }, size: 'S' }] }
    expect(controlsOf(prunePanel(broken, []))).toHaveLength(3)
  })
})

describe('every patch edit keeps the panel', () => {
  const patch = createDefaultPatch()
  const filterNode = patch.nodes.find((node) => node.type === 'filter')!
  const withPanel = addControl(patch, [], { kind: 'knob', bind: { node: filterNode.id, param: 'cutoff' } })
  const a = createNode('gain', 0, 0)
  const b = createNode('gain', 0, 0)

  it('keeps it through add, move, param, bypass, stereo, sample, track, connect and disconnect', () => {
    expect(withPanel.panel).toBeDefined()
    const edits: Array<(p: Patch) => Patch> = [
      (p) => addNode(p, a),
      (p) => moveNode(p, filterNode.id, 5, 5),
      (p) => setNodeParam(p, filterNode.id, 'cutoff', 500),
      (p) => setNodeBypassed(p, filterNode.id, true),
      (p) => setNodeStereo(p, filterNode.id, true, []),
      (p) => setNodeSample(p, filterNode.id, null),
      (p) => setNodeTrack(p, filterNode.id, null),
      (p) => connect(addNode(addNode(p, a), b), { node: a.id, port: 'out' }, { node: b.id, port: 'in' }),
      (p) => {
        const wired = connect(addNode(addNode(p, a), b), { node: a.id, port: 'out' }, { node: b.id, port: 'in' })
        return disconnect(wired, wired.connections.at(-1)!.id)
      },
    ]
    for (const edit of edits) expect(edit(withPanel).panel).toBe(withPanel.panel)
  })
})

describe('flattenPatch and the panel', () => {
  it('never carries the panel to the engine', () => {
    const panelled = addControl(base, [], { kind: 'knob', bind: cutoff })
    expect(flattenPatch(panelled, []).panel).toBeUndefined()
    expect(flattenPatch(panelled, []).nodes).toBe(panelled.nodes)
    expect(flattenPatch(base, [])).toBe(base)
  })
})
