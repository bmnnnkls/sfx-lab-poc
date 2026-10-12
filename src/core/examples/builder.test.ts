import { describe, expect, it } from 'vitest'
import { describeNode } from '../patch'
import { knob, led, meter, moduleOf, patchOf, toggle, useModule, xyPad } from './builder'
import { chordNotes, clipOf, drumNotes, heldClip, lineNotes, pitchOf } from './score'

describe('patchOf', () => {
  const chain = () =>
    patchOf(
      [
        { id: 'note', type: 'note' },
        { id: 'osc', type: 'oscillator' },
        { id: 'amp', type: 'gain' },
        { id: 'out', type: 'output' },
      ],
      ['note.frequency>osc.freq', 'osc.out>amp.in', 'amp.out>out.in'],
    )

  it('wires nodes by readable id and gives wires stable ids', () => {
    const patch = chain()
    expect(patch.connections.map((wire) => wire.id)).toEqual(['w0', 'w1', 'w2'])
    expect(patch.connections[1]).toMatchObject({ from: { node: 'osc', port: 'out' }, to: { node: 'amp', port: 'in' } })
  })

  it('puts every node to the right of what feeds it, and stacks a column without overlap', () => {
    const patch = chain()
    const x = (id: string) => patch.nodes.find((node) => node.id === id)!.x
    expect(x('note')).toBeLessThan(x('osc'))
    expect(x('osc')).toBeLessThan(x('amp'))
    expect(x('amp')).toBeLessThan(x('out'))
    const column = patchOf([{ id: 'a', type: 'oscillator' }, { id: 'b', type: 'oscillator' }, { id: 'c', type: 'oscillator' }], [])
    const tops = column.nodes.map((node) => node.y)
    expect(tops).toEqual([...tops].sort((p, q) => p - q))
    expect(new Set(tops).size).toBe(3)
  })

  it('puts a control just before the node it feeds, not at the far left', () => {
    const patch = patchOf(
      [{ id: 'osc', type: 'oscillator' }, { id: 'a', type: 'gain' }, { id: 'b', type: 'gain' }, { id: 'out', type: 'output' }, knob('level', 'Level', { value: 0.5, min: 0, max: 1 })],
      ['osc.out>a.in', 'a.out>b.in', 'b.out>out.in', 'level.out>b.param:gain'],
    )
    const x = (id: string) => patch.nodes.find((node) => node.id === id)!.x
    expect(x('level')).toBe(x('a'))
  })

  it('prefixes node and wire ids, so ids stay unique across the graphs of a track', () => {
    const patch = patchOf([{ id: 'in', type: 'trackIn' }, { id: 'out', type: 'trackOut' }], ['in.out>out.in'], { prefix: 'fx_' })
    expect(patch.nodes.map((node) => node.id)).toEqual(['fx_in', 'fx_out'])
    expect(patch.connections[0]).toMatchObject({ id: 'fx_w0', from: { node: 'fx_in' }, to: { node: 'fx_out' } })
  })

  it('starts every node at its defaults and applies only what was given', () => {
    const osc = chain().nodes.find((node) => node.id === 'osc')!
    expect(osc.params).toEqual(Object.fromEntries(describeNode(osc)!.params.map((param) => [param.id, param.default])))
    const tuned = patchOf([{ id: 'f', type: 'filter', params: { cutoff: 300 } }], []).nodes[0]!
    expect(tuned.params.cutoff).toBe(300)
    expect(tuned.params.resonance).toBeCloseTo(0.707)
  })

  it('refuses what the sound could not use, and says what is wrong', () => {
    const nodes = [{ id: 'osc', type: 'oscillator' }, { id: 'amp', type: 'gain' }]
    expect(() => patchOf(nodes, ['osc.nope>amp.in'])).toThrow(/no output "nope".*it has: out/)
    expect(() => patchOf(nodes, ['osc.out>amp.nope'])).toThrow(/no input "nope"/)
    expect(() => patchOf(nodes, ['osc.out>ghost.in'])).toThrow(/no node "ghost"/)
    expect(() => patchOf(nodes, ['osc.out>amp.in', 'osc.out>amp.in'])).toThrow(/twice/)
    expect(() => patchOf(nodes, ['amp.out>osc.freq', 'osc.out>amp.in'])).toThrow(/loop/)
    expect(() => patchOf(nodes, ['osc-out-amp-in'])).toThrow(/from.port>to.port/)
    expect(() => patchOf([{ id: 'x', type: 'oscillator' }, { id: 'x', type: 'gain' }], [])).toThrow(/twice/)
    expect(() => patchOf([{ id: 'x', type: 'nonsense' }], [])).toThrow(/Unknown node type/)
  })

  it('refuses a parameter that does not exist or lies outside its range (it would be clamped the first time the project is saved)', () => {
    expect(() => patchOf([{ id: 'g', type: 'gain', params: { volume: 1 } }], [])).toThrow(/no parameter "volume"/)
    expect(() => patchOf([{ id: 'g', type: 'gain', params: { gain: 2.4 } }], [])).toThrow(/outside 0\.\.2/)
    expect(() => patchOf([{ id: 'g', type: 'gain', params: { gain: Number.NaN } }], [])).toThrow(/outside/)
  })

  it('locks the structure by default but leaves controls, indicators and module uses free, and `locked: false` opts a node out', () => {
    const modules = [moduleOf({ id: 'm', name: 'M', nodes: [{ id: 'g', type: 'gain' }], wires: [], inputs: [{ label: 'In', at: 'g.in' }], outputs: [{ label: 'Out', at: 'g.out' }] })]
    const patch = patchOf(
      [
        { id: 'osc', type: 'oscillator' },
        { id: 'seed', type: 'random', locked: false },
        knob('k', 'K', { value: 0.5, min: 0, max: 1 }),
        toggle('t', 'T'),
        led('l', 'L'),
        meter('b', 'B'),
        useModule('use', 'm'),
      ],
      [],
      { modules },
    )
    const locked = Object.fromEntries(patch.nodes.map((node) => [node.id, node.locked === true]))
    expect(locked).toEqual({ osc: true, seed: false, k: false, t: false, l: false, b: false, use: false })
  })
})

describe('controls', () => {
  it('a knob carries its range, curve, unit and a default for double-click', () => {
    const spec = knob('k', 'Cutoff', { value: 800, min: 100, max: 8000, unit: 'Hz', curve: 'log', home: 1000, size: 'M' })
    expect(spec).toMatchObject({ type: 'control', name: 'Cutoff', unit: 'Hz', panel: { size: 'M' }, params: { value: 800, min: 100, max: 8000, curve: 1, default: 1000 } })
  })

  it('refuses a value outside its own range', () => {
    expect(() => knob('k', 'K', { value: 2, min: 0, max: 1 })).toThrow(/inside 0\.\.1/)
    expect(() => xyPad('p', 'P', { value: 0.5, min: 0, max: 1 }, { value: 5, min: 0, max: 1 })).toThrow(/p\.y/)
  })

  it('a pad has two axes with their own units, and a push button outputs a pulse', () => {
    const pad = xyPad('p', 'Pad', { value: 1, min: 0, max: 2, unit: 'Hz' }, { value: 10, min: 0, max: 20, unit: 'dB' })
    expect(pad).toMatchObject({ unit: 'Hz', unitY: 'dB', params: { x: 1, xMax: 2, y: 10, yMax: 20 } })
    expect(toggle('b', 'Go', { mode: 'trigger', pulse: 0.2 }).params).toMatchObject({ mode: 2, pulse: 0.2 })
    expect(toggle('m', 'Hold', { mode: 'momentary', offValue: 1, onValue: 0 }).params).toMatchObject({ mode: 1, offValue: 1, onValue: 0 })
  })
})

describe('moduleOf', () => {
  const definition = () =>
    moduleOf({
      id: 'half',
      name: 'Half',
      nodes: [{ id: 'g', type: 'gain', params: { gain: 0.5 } }, knob('trim', 'Trim', { value: 1, min: 0, max: 1 })],
      wires: ['trim.out>g.param:gain'],
      inputs: [{ label: 'In', at: 'g.in' }],
      outputs: [{ label: 'Out', at: 'g.out' }],
      knobs: [{ label: 'Gain', at: 'g.gain' }],
    })

  it('names its ports and knobs by the inner node and port, like the editor does', () => {
    const half = definition()
    expect(half.inputs[0]).toMatchObject({ id: 'g:in', label: 'In', inner: { node: 'g', port: 'in' } })
    expect(half.knobs[0]).toMatchObject({ id: 'g:gain', node: 'g', param: 'gain' })
  })

  it('can be wired through the ports it exposes and its values set per use', () => {
    const modules = [definition()]
    const patch = patchOf([{ id: 'osc', type: 'oscillator' }, useModule('half', 'half', { 'trim:value': 0.25 }), { id: 'out', type: 'output' }], ['osc.out>half.g:in', 'half.g:out>out.in'], { modules })
    expect(patch.nodes.find((node) => node.id === 'half')!.params['trim:value']).toBe(0.25)
    expect(() => patchOf([{ id: 'osc', type: 'oscillator' }, useModule('half', 'half')], ['osc.out>half.in'], { modules })).toThrow(/no input "in".*g:in/)
  })

  it('refuses an exposed port on a node that is not there', () => {
    expect(() => moduleOf({ id: 'm', name: 'M', nodes: [{ id: 'g', type: 'gain' }], wires: [], inputs: [{ label: 'In', at: 'ghost.in' }], outputs: [] })).toThrow(/no node "ghost"/)
  })
})

describe('pitchOf', () => {
  it('reads note names the way the piano roll names them (C4 is 60)', () => {
    expect(pitchOf('C4')).toBe(60)
    expect(pitchOf('A4')).toBe(69)
    expect(pitchOf('A1')).toBe(33)
    expect(pitchOf('C#3')).toBe(49)
    expect(pitchOf('Bb2')).toBe(46)
    expect(pitchOf('62')).toBe(62)
    expect(() => pitchOf('H2')).toThrow(/Not a note name/)
  })
})

describe('drumNotes', () => {
  it('turns a pattern into hits on a sixteenth grid; spaces and bars are ignored', () => {
    const { notes, beats } = drumNotes('c', 'x... X... | o... g...')
    expect(beats).toBe(4)
    expect(notes.map((note) => note.start)).toEqual([0, 1, 2, 3])
    expect(notes.map((note) => note.velocity)).toEqual([0.82, 1, 0.62, 0.36])
  })

  it('swings the second sixteenth of each pair and nothing else', () => {
    const { notes } = drumNotes('c', 'xxxx', { swing: 66.7 })
    expect(notes[0]!.start).toBe(0)
    expect(notes[1]!.start).toBeCloseTo(0.25 + 0.0835, 3)
    expect(notes[2]!.start).toBe(0.5)
    expect(notes[3]!.start).toBeCloseTo(0.75 + 0.0835, 3)
  })

  it('is the same every time, differs with the seed, and gives notes stable ids', () => {
    const a = drumNotes('c', 'xxxxxxxx', { drift: 0.01, dynamics: 0.1, seed: 4 })
    expect(drumNotes('c', 'xxxxxxxx', { drift: 0.01, dynamics: 0.1, seed: 4 })).toEqual(a)
    expect(drumNotes('c', 'xxxxxxxx', { drift: 0.01, dynamics: 0.1, seed: 5 })).not.toEqual(a)
    expect(a.notes.map((note) => note.id)).toEqual(Array.from({ length: 8 }, (_, index) => `c-n${index}`))
  })

  it('cycles through a list of pitches, and refuses a character it does not know', () => {
    expect(drumNotes('c', 'xxx', { pitch: [60, 62] }).notes.map((note) => note.pitch)).toEqual([60, 62, 60])
    expect(() => drumNotes('c', 'x?x')).toThrow(/Unknown hit "\?"/)
  })
})

describe('lineNotes', () => {
  it('reads one token per step: a rest, a pitch, a held pitch, a velocity and a chord', () => {
    const { notes, beats } = lineNotes('l', 'A1 . C2:2 . E3@0.5 A3+C4+E4', { step: 0.25 })
    expect(beats).toBe(1.5)
    expect(notes.map((note) => [note.pitch, note.start, note.duration, note.velocity])).toEqual([
      [33, 0, 0.225, 0.85],
      [36, 0.5, 0.5, 0.85],
      [52, 1, 0.225, 0.5],
      [57, 1.25, 0.225, 0.85],
      [60, 1.25, 0.225, 0.85],
      [64, 1.25, 0.225, 0.85],
    ])
  })

  it('refuses a token it cannot read', () => {
    expect(() => lineNotes('l', 'A1 @@')).toThrow(/Bad token/)
  })
})

describe('clips', () => {
  it('chordNotes lays chords in time with one velocity, and heldClip is one note for the whole clip', () => {
    const { notes } = chordNotes('c', [[0, 4, 'D3+A3'], [4, 4, 'G3']], 8, 0.6)
    expect(notes.map((note) => [note.pitch, note.start, note.duration, note.velocity])).toEqual([[50, 0, 4, 0.6], [57, 0, 4, 0.6], [55, 4, 4, 0.6]])
    expect(heldClip('h', 'Held', 16, 'D2', 0.7)).toMatchObject({ lengthBeats: 16, notes: [{ pitch: 38, start: 0, duration: 16, velocity: 0.7 }] })
  })

  it('clipOf drops notes that start after the loop ends', () => {
    expect(clipOf('c', 'C', { notes: drumNotes('c', 'xxxxxxxx').notes, beats: 2 }, 1).notes).toHaveLength(4)
  })
})
