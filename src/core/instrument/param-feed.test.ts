import { describe, expect, it } from 'vitest'
import { type NoteGraphNodeSpec, type Patch, noteGraphFrom, setNodeParam } from '../patch'
import { SampleBank } from '../sample'
import { FxGraph } from './fx-graph'
import { Instrument } from './instrument'
import { classifyStages, planStages } from './stages'

const SAMPLE_RATE = 48000
const FRAMES = 128

const sine = (frequency: number, blocks = 8) =>
  Float32Array.from({ length: blocks * FRAMES }, (_, i) => Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE))

const run = (graph: FxGraph, input: Float32Array): Float32Array => {
  const out = new Float32Array(input.length)
  for (let at = 0; at < input.length; at += FRAMES) {
    out.set(graph.process(input.subarray(at, at + FRAMES), FRAMES).subarray(0, FRAMES), at)
  }
  return out
}

const fx = (patch: Patch) => new FxGraph(patch, SAMPLE_RATE, new SampleBank())

/** Track in -> gain -> Track out, with whatever extra nodes and wires the test adds. */
const gainGraph = (extra: Array<{ id: string; type: string; params?: Record<string, number> }> = [], wires: string[] = [], gain: Record<string, number> = {}) =>
  noteGraphFrom(
    [{ id: 'in', type: 'trackIn' }, { id: 'g', type: 'gain', params: gain }, { id: 'out', type: 'trackOut' }, ...extra],
    ['in.out>g.in', 'g.out>out.in', ...wires],
  )

describe('a wire into a parameter socket replaces the parameter (insert graph)', () => {
  const input = sine(440)
  const reference = run(fx(gainGraph([], [], { gain: 0.25 })), input)

  it('the node uses the wire, not its stored value', () => {
    const driven = gainGraph([{ id: 'c', type: 'control', params: { value: 0.25 } }], ['c.out>g.param:gain'], { gain: 2 })
    expect(run(fx(driven), input)).toEqual(reference)
  })

  it('unwired, the node uses its own value again', () => {
    expect(run(fx(gainGraph([], [], { gain: 2 })), input)[10]).toBeCloseTo(input[10]! * 2, 6)
  })

  it('turning the control changes the sound; turning the stored value of a driven parameter does not', () => {
    const graph = fx(gainGraph([{ id: 'c', type: 'control', params: { value: 0.25 } }], ['c.out>g.param:gain'], { gain: 2 }))
    const first = graph.process(input.subarray(0, FRAMES), FRAMES).slice(0, FRAMES)
    graph.setParam('g', 'gain', 1.5) // what a slider on the card does: the wire wins
    graph.setParam('c', 'value', 0.5)
    const second = graph.process(input.subarray(0, FRAMES), FRAMES).slice(0, FRAMES)
    expect(first[20]).toBeCloseTo(input[20]! * 0.25, 6)
    expect(second[20]).toBeCloseTo(input[20]! * 0.5, 6)
  })

  it('a control wired to several sockets feeds each its own value unchanged', () => {
    const graph = noteGraphFrom(
      [{ id: 'in', type: 'trackIn' }, { id: 'a', type: 'gain', params: { gain: 2 } }, { id: 'b', type: 'gain', params: { gain: 2 } }, { id: 'c', type: 'control', params: { value: 0.5 } }, { id: 'out', type: 'trackOut' }],
      ['in.out>a.in', 'a.out>b.in', 'b.out>out.in', 'c.out>a.param:gain', 'c.out>b.param:gain'],
    )
    expect(run(fx(graph), input)[20]).toBeCloseTo(input[20]! * 0.25, 6)
  })

  it('several wires into one socket add up', () => {
    const graph = gainGraph(
      [{ id: 'c1', type: 'control', params: { value: 0.1 } }, { id: 'c2', type: 'control', params: { value: 0.15 } }],
      ['c1.out>g.param:gain', 'c2.out>g.param:gain'],
    )
    expect(run(fx(graph), input)[20]).toBeCloseTo(input[20]! * 0.25, 6)
  })

  it('a node running in stereo drives both of its copies', () => {
    const base = gainGraph([{ id: 'c', type: 'control', params: { value: 0.25 } }], ['c.out>g.param:gain'])
    const stereo: Patch = { ...base, nodes: base.nodes.map((node) => (node.id === 'g' ? { ...node, stereo: true } : node)) }
    const out = fx(stereo).process(input.subarray(0, FRAMES), FRAMES)
    expect(out[20]).toBeCloseTo(input[20]! * 0.25, 6)
    expect(out[FRAMES + 20]).toBeCloseTo(input[20]! * 0.25, 6)
  })
})

describe('a parameter socket is read once per block', () => {
  it('uses the first sample of each block of a signal, and holds it for the block', () => {
    // The input signal is a ramp 0..1; it drives the gain of the same ramp.
    const ramp = Float32Array.from({ length: 4 * FRAMES }, (_, i) => i / (4 * FRAMES))
    const graph = noteGraphFrom(
      [{ id: 'in', type: 'trackIn' }, { id: 'g', type: 'gain' }, { id: 'out', type: 'trackOut' }, { id: 'k', type: 'trackIn' }],
      ['in.out>g.in', 'g.out>out.in', 'k.out>g.param:gain'],
    )
    const out = run(fx(graph), ramp)
    for (let block = 0; block < 4; block++) {
      const held = ramp[block * FRAMES]!
      for (const i of [0, 1, 77, FRAMES - 1]) {
        expect(out[block * FRAMES + i]).toBeCloseTo(ramp[block * FRAMES + i]! * held, 6)
      }
    }
  })

  it('ignores a value that is not a number, keeping the last good one', () => {
    const graph = fx(noteGraphFrom(
      [{ id: 'in', type: 'trackIn' }, { id: 'g', type: 'gain' }, { id: 'out', type: 'trackOut' }, { id: 'k', type: 'trackIn' }],
      ['in.out>g.in', 'g.out>out.in', 'k.out>g.param:gain'],
    ))
    const good = new Float32Array(FRAMES).fill(0.5)
    expect(graph.process(good, FRAMES)[5]).toBeCloseTo(0.25, 6)
    const bad = new Float32Array(FRAMES).fill(Number.NaN)
    bad[0] = Number.NaN
    expect(Number.isFinite(graph.process(bad, FRAMES)[5]!)).toBe(false) // NaN in, NaN through the signal path: the gain itself stayed 0.5
    expect(graph.process(good, FRAMES)[5]).toBeCloseTo(0.25, 6)
  })
})

describe('stages', () => {
  const stageOf = (patch: Patch) => classifyStages(patch)

  it('controls are global; math on controls is global; math fed by a voice signal is a voice node', () => {
    const patch = noteGraphFrom(
      [
        { id: 'note', type: 'note' }, { id: 'c', type: 'control' }, { id: 'add', type: 'add' }, { id: 'osc', type: 'oscillator' },
        { id: 'mul', type: 'multiply' }, { id: 'gain', type: 'gain' }, { id: 'out', type: 'output' },
      ],
      ['c.out>add.a', 'note.frequency>osc.freq', 'osc.out>mul.a', 'add.out>mul.param:b', 'mul.out>gain.in', 'add.out>gain.param:gain', 'gain.out>out.in'],
    )
    const stages = stageOf(patch)
    const stage = (id: string) => stages.get(id)
    expect(['note', 'c', 'add', 'osc', 'mul', 'gain', 'out'].map(stage)).toEqual(['voice', 'global', 'global', 'voice', 'voice', 'voice', 'voice'])
    expect(new Set(planStages(patch).globalOrder)).toEqual(new Set(['c', 'add']))
    expect(planStages(patch).globalOrder.indexOf('c')).toBeLessThan(planStages(patch).globalOrder.indexOf('add'))
    expect(planStages(patch).boundaries).toEqual([])
  })

  it('a math node with nothing wired is global (it is a constant), and anything shared downstream stays shared', () => {
    const patch = noteGraphFrom(
      [{ id: 'm', type: 'add' }, { id: 'osc', type: 'oscillator' }, { id: 'delay', type: 'delay' }, { id: 'late', type: 'add' }],
      ['osc.out>delay.in', 'delay.out>late.a'],
    )
    const stages = stageOf(patch)
    expect([stages.get('m'), stages.get('osc'), stages.get('delay'), stages.get('late')]).toEqual(['global', 'voice', 'shared', 'shared'])
  })

  it('a node that is not global-capable stays a voice node even when only controls feed it', () => {
    const patch = noteGraphFrom([{ id: 'c', type: 'control' }, { id: 'osc', type: 'oscillator' }], ['c.out>osc.freq'])
    expect(stageOf(patch).get('osc')).toBe('voice')
  })
})

describe('Instrument with a global stage', () => {
  /** note -> osc -> gain -> [delay] -> output; a control drives the gain (or the delay mix) when `controlled`. */
  const build = (controlled: boolean, target: 'gain' | 'mix') => {
    const nodes: NoteGraphNodeSpec[] = [
      { id: 'note', type: 'note' },
      { id: 'osc', type: 'oscillator', params: { waveform: 0 } },
      { id: 'gain', type: 'gain', params: target === 'gain' && !controlled ? { gain: 0.5 } : { gain: 1 } },
      { id: 'delay', type: 'delay', params: { time: 0.01, feedback: 0.4, mix: target === 'mix' && !controlled ? 0.5 : 1 } },
      { id: 'out', type: 'output' },
      ...(controlled ? [{ id: 'c', type: 'control', params: { value: 0.5 } }] : []),
    ]
    const wires = ['note.frequency>osc.freq', 'osc.out>gain.in', 'gain.out>delay.in', 'delay.out>out.in']
    if (controlled) wires.push(`c.out>${target === 'gain' ? 'gain.param:gain' : 'delay.param:mix'}`)
    return noteGraphFrom(nodes, wires)
  }

  const chord = (patch: Patch, pitches: number[]): Float32Array => {
    const instrument = new Instrument(patch, SAMPLE_RATE, 8, new SampleBank())
    for (const pitch of pitches) instrument.noteOn(pitch, 1)
    const out = new Float32Array(FRAMES * 40)
    for (let at = 0; at < out.length; at += FRAMES) out.set(instrument.render(FRAMES).subarray(0, FRAMES), at)
    return out
  }

  it.each([['gain'], ['mix']] as const)(
    'a control driving a %s is one value for the whole chord, not once per voice: three voices sound as if the value were typed in',
    (target) => {
      const pitches = [57, 61, 64]
      const reference = chord(build(false, target), pitches)
      const driven = chord(build(true, target), pitches)
      expect(reference.some((v) => Math.abs(v) > 0.1)).toBe(true)
      for (let i = 0; i < reference.length; i++) expect(driven[i], `sample ${i}`).toBeCloseTo(reference[i]!, 5)
    },
  )

  it('a control reaches voices that start later, and a stored value cannot override the wire', () => {
    const patch = build(true, 'gain')
    const instrument = new Instrument(patch, SAMPLE_RATE, 4, new SampleBank())
    instrument.setParam('gain', 'gain', 2) // ignored: driven
    instrument.noteOn(60, 1)
    for (let i = 0; i < 5; i++) instrument.render(FRAMES)
    instrument.noteOn(64, 1)
    const late = instrument.render(FRAMES).slice(0, FRAMES)
    expect(Math.max(...late.map(Math.abs))).toBeLessThan(2) // two notes at gain 0.5 each; at gain 2 they would reach ~4
  })

  it('a control moved while playing moves every voice at the next block', () => {
    const patch = noteGraphFrom(
      [{ id: 'note', type: 'note' }, { id: 'osc', type: 'oscillator' }, { id: 'gain', type: 'gain' }, { id: 'c', type: 'control', params: { value: 0.5 } }, { id: 'out', type: 'output' }],
      ['note.frequency>osc.freq', 'osc.out>gain.in', 'gain.out>out.in', 'c.out>gain.param:gain'],
    )
    const instrument = new Instrument(patch, SAMPLE_RATE, 4, new SampleBank())
    instrument.noteOn(60, 1)
    instrument.noteOn(67, 1)
    const peak = () => Math.max(...instrument.render(FRAMES).map(Math.abs))
    for (let i = 0; i < 3; i++) peak()
    const loud = peak()
    instrument.setParam('c', 'value', 0)
    expect(loud).toBeGreaterThan(0.1)
    expect(peak()).toBe(0)
  })

  it('math on a control drives a voice node: a MIDI note control through MIDI to Hz sets the pitch whatever key is played', () => {
    const patch = noteGraphFrom(
      [
        { id: 'note', type: 'note' }, { id: 'c', type: 'control', params: { value: 69, min: 0, max: 127, step: 1 } },
        { id: 'hz', type: 'midiToHz' }, { id: 'osc', type: 'oscillator', params: { waveform: 0 } }, { id: 'out', type: 'output' },
      ],
      ['c.out>hz.note', 'hz.out>osc.freq', 'osc.out>out.in'],
    )
    const goertzel = (signal: Float32Array, frequency: number) => {
      const w = (2 * Math.PI * frequency) / SAMPLE_RATE
      let re = 0
      let im = 0
      signal.forEach((s, n) => { re += s * Math.cos(w * n); im -= s * Math.sin(w * n) })
      return Math.hypot(re, im) / signal.length
    }
    for (const pitches of [[40], [40, 90]]) {
      const out = chord(patch, pitches).subarray(FRAMES * 4)
      expect(goertzel(out, 440), String(pitches)).toBeGreaterThan(goertzel(out, 261.63) * 20)
      expect(goertzel(out, 440), String(pitches)).toBeGreaterThan(goertzel(out, 880) * 20)
    }
    const moved = chord(setNodeParam(patch, 'c', 'value', 81), [40]).subarray(FRAMES * 4)
    expect(goertzel(moved, 880)).toBeGreaterThan(goertzel(moved, 440) * 20)
  })

  it('a patch without controls compiles to the same stages as before', () => {
    const plan = planStages(build(false, 'gain'))
    expect(plan.globalOrder).toEqual([])
    expect(plan.boundaries).toEqual(['gain:out'])
  })
})
