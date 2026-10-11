import { describe, expect, it } from 'vitest'
import { createDefaultNoteGraph, createDefaultPatch, noteGraphFrom, setNodeParam } from '../patch'
import { createClip, createNote } from '../project'
import { Engine } from './engine'

const SAMPLE_RATE = 48000
const BEAT = 24000 // 120 bpm

/** A sine-wave version of the default instrument, so a note's pitch can be read off the spectrum. */
const sinePatch = () => {
  const patch = createDefaultPatch()
  const osc = patch.nodes.find((n) => n.type === 'oscillator')!
  const filter = patch.nodes.find((n) => n.type === 'filter')!
  const delay = patch.nodes.find((n) => n.type === 'delay')!
  return setNodeParam(setNodeParam(setNodeParam(patch, osc.id, 'waveform', 0), filter.id, 'cutoff', 20000), delay.id, 'mix', 0)
}

const chain = (...effects: [string, Record<string, number>?][]) => {
  const nodes = [
    { id: 'c', type: 'clipNotes' },
    ...effects.map(([type, params], index) => ({ id: `e${index}`, type, params })),
    { id: 'o', type: 'noteOut' },
  ]
  return noteGraphFrom(nodes, nodes.slice(1).map((node, index) => `${nodes[index]!.id}.out>${node.id}.in`))
}

type Graph = ReturnType<typeof chain>

const setup = (tracks: { id: string; notes: ReturnType<typeof createNote>[]; graph?: Graph; volume?: number }[], order: 'given' | 'reversed' = 'given') => {
  const engine = new Engine(SAMPLE_RATE)
  engine.apply({ type: 'transport/setTempo', bpm: 120 })
  const clips = new Map(tracks.map((t) => [t.id, createClip(`clip ${t.id}`, 4, t.notes)]))
  for (const t of order === 'given' ? tracks : [...tracks].reverse()) {
    engine.apply({ type: 'track/add', kind: 'instrument', trackId: t.id, patch: sinePatch(), noteGraph: t.graph ?? createDefaultNoteGraph(), clips: [clips.get(t.id)!], volume: t.volume ?? 1, voices: 8 })
  }
  return { engine, launch: (id: string) => engine.apply({ type: 'clip/launch', trackId: id, clipId: clips.get(id)!.id }) }
}

const render = (engine: Engine, frames: number, chunk = 1000) => {
  const out = new Float32Array(frames)
  for (let offset = 0; offset < frames; offset += chunk) {
    const n = Math.min(chunk, frames - offset)
    const left = new Float32Array(n)
    engine.render(left, new Float32Array(n))
    out.set(left, offset)
  }
  return out
}

const energyAt = (signal: Float32Array, from: number, to: number, frequency: number): number => {
  const w = (2 * Math.PI * frequency) / SAMPLE_RATE
  let re = 0
  let im = 0
  for (let n = from; n < to; n++) {
    re += signal[n]! * Math.cos(w * (n - from))
    im -= signal[n]! * Math.sin(w * (n - from))
  }
  return (re * re + im * im) / ((to - from) * (to - from))
}
const hz = (pitch: number) => 440 * 2 ** ((pitch - 69) / 12)
const loudest = (signal: Float32Array, from: number, to: number, pitches: number[]) =>
  pitches.reduce((best, pitch) => (energyAt(signal, from, to, hz(pitch)) > energyAt(signal, from, to, hz(best)) ? pitch : best))
const peak = (signal: Float32Array) => signal.reduce((m, v) => Math.max(m, Math.abs(v)), 0)

describe('note graphs in the engine', () => {
  const held = [createNote(57, 0, 4, 1), createNote(61, 0, 4, 1), createNote(64, 0, 4, 1)]

  it('the default graph plays the clip as written', () => {
    const { engine, launch } = setup([{ id: 'a', notes: [createNote(57, 0, 2, 1)] }])
    launch('a')
    expect(loudest(render(engine, BEAT), 4000, 20000, [57, 69])).toBe(57)
  })

  it('an effect in the graph changes the pitch', () => {
    const { engine, launch } = setup([{ id: 'a', notes: [createNote(57, 0, 2, 1)], graph: chain(['transpose', { semitones: 12 }]) }])
    launch('a')
    expect(loudest(render(engine, BEAT), 4000, 20000, [57, 69])).toBe(69)
  })

  it('an arpeggiator plays a held chord one note at a time, in time', () => {
    const { engine, launch } = setup([{ id: 'a', notes: held, graph: chain(['arpeggiator', { rate: 1, pattern: 0, gate: 0.8 }]) }])
    launch('a')
    const out = render(engine, 2 * BEAT)
    const step = BEAT / 2
    expect([0, 1, 2, 3].map((i) => loudest(out, i * step + 3000, i * step + 9000, [57, 61, 64]))).toEqual([57, 61, 64, 57])
  })

  it('a split graph plays both branches at once (original and an octave up)', () => {
    const graph = noteGraphFrom(
      [{ id: 'c', type: 'clipNotes' }, { id: 'up', type: 'transpose', params: { semitones: 12 } }, { id: 'o', type: 'noteOut' }],
      ['c.out>o.in', 'c.out>up.in', 'up.out>o.in'],
    )
    const { engine, launch } = setup([{ id: 'a', notes: [createNote(57, 0, 2, 1)], graph }])
    launch('a')
    const out = render(engine, BEAT)
    expect(energyAt(out, 4000, 20000, hz(57))).toBeGreaterThan(1e-4)
    expect(energyAt(out, 4000, 20000, hz(69))).toBeGreaterThan(1e-4)
  })

  describe('notes from another track', () => {
    // track "lead" has no sound of its own (volume 0) and plays A3; track "bass" takes those notes up an octave
    const bassGraph = (tap: number) =>
      noteGraphFrom(
        [{ id: 't', type: 'trackNotes', trackId: 'lead', params: { tap } }, { id: 'x', type: 'transpose', params: { semitones: 12 } }, { id: 'o', type: 'noteOut' }],
        ['t.out>x.in', 'x.out>o.in'],
      )
    const tracks = (tap: number, leadGraph?: Graph) => [
      { id: 'lead', notes: [createNote(57, 0, 2, 1)], volume: 0, graph: leadGraph },
      { id: 'bass', notes: [], graph: bassGraph(tap) },
    ]

    it('another track\'s notes play through this track\'s instrument', () => {
      const { engine, launch } = setup(tracks(0))
      launch('lead')
      expect(loudest(render(engine, BEAT), 4000, 20000, [57, 69])).toBe(69)
    })

    it('works whichever order the tracks were added in', () => {
      const { engine, launch } = setup(tracks(0), 'reversed')
      launch('lead')
      expect(loudest(render(engine, BEAT), 4000, 20000, [57, 69])).toBe(69)
    })

    it('can take what leaves the other track\'s graph instead of its clip notes', () => {
      const leadFifth = chain(['transpose', { semitones: 7 }])
      const clipNotes = setup(tracks(0, leadFifth))
      clipNotes.launch('lead')
      expect(loudest(render(clipNotes.engine, BEAT), 4000, 20000, [57, 64, 69, 76])).toBe(69) // 57 + 12
      const afterGraph = setup(tracks(1, leadFifth))
      afterGraph.launch('lead')
      expect(loudest(render(afterGraph.engine, BEAT), 4000, 20000, [57, 64, 69, 76])).toBe(76) // (57 + 7) + 12
    })

    it('the source track keeps sounding as normal', () => {
      const loud = [{ ...tracks(0)[0]!, volume: 1 }, tracks(0)[1]!]
      const { engine, launch } = setup(loud)
      launch('lead')
      const out = render(engine, BEAT)
      expect(energyAt(out, 4000, 20000, hz(57))).toBeGreaterThan(1e-4) // lead's own note
      expect(energyAt(out, 4000, 20000, hz(69))).toBeGreaterThan(1e-4) // bass's copy, an octave up
    })

    it('mixes with the track\'s own notes', () => {
      const [lead] = tracks(0)
      const mixed = noteGraphFrom(
        [{ id: 'c', type: 'clipNotes' }, { id: 't', type: 'trackNotes', trackId: 'lead' }, { id: 'o', type: 'noteOut' }],
        ['c.out>o.in', 't.out>o.in'],
      )
      const { engine, launch } = setup([lead!, { id: 'bass', notes: [createNote(64, 0, 2, 1)], graph: mixed }])
      launch('lead')
      launch('bass')
      const out = render(engine, BEAT)
      expect(energyAt(out, 4000, 20000, hz(57))).toBeGreaterThan(1e-4)
      expect(energyAt(out, 4000, 20000, hz(64))).toBeGreaterThan(1e-4)
    })

    it('two tracks that read from each other do not hang or crash', () => {
      const a = noteGraphFrom([{ id: 't', type: 'trackNotes', trackId: 'b' }, { id: 'o', type: 'noteOut' }], ['t.out>o.in'])
      const b = noteGraphFrom([{ id: 't', type: 'trackNotes', trackId: 'a' }, { id: 'o', type: 'noteOut' }], ['t.out>o.in'])
      const { engine, launch } = setup([{ id: 'a', notes: [createNote(57, 0, 2, 1)], graph: a }, { id: 'b', notes: [createNote(64, 0, 2, 1)], graph: b }])
      launch('a')
      launch('b')
      expect(Number.isFinite(peak(render(engine, BEAT)))).toBe(true)
    })

    it('removing the source track leaves the reader silent but running', () => {
      const { engine, launch } = setup(tracks(0))
      launch('lead')
      render(engine, 2000)
      engine.apply({ type: 'track/remove', trackId: 'lead' })
      expect(Number.isFinite(peak(render(engine, BEAT)))).toBe(true)
    })
  })

  it('swapping the graph while playing leaves nothing hanging', () => {
    const { engine, launch } = setup([{ id: 'a', notes: held, graph: chain(['arpeggiator', { rate: 3, gate: 1 }]) }])
    launch('a')
    render(engine, BEAT)
    engine.apply({ type: 'track/setNoteGraph', trackId: 'a', graph: createDefaultNoteGraph() })
    engine.apply({ type: 'track/stop', trackId: 'a' })
    const after = render(engine, BEAT * 6)
    expect(peak(after.subarray(after.length - 4000))).toBeLessThan(1e-4)
  })

  it('stopping the transport silences an arpeggio', () => {
    const { engine, launch } = setup([{ id: 'a', notes: held, graph: chain(['arpeggiator', { rate: 3, gate: 1 }]) }])
    launch('a')
    render(engine, BEAT)
    engine.apply({ type: 'transport/stop' })
    const tail = render(engine, 40000)
    expect(peak(tail.subarray(30000))).toBeLessThan(1e-4)
  })

  it('renders identically whole blocks at a time however the output is chunked', () => {
    const run = (chunk: number) => {
      const { engine, launch } = setup([{ id: 'a', notes: held, graph: chain(['arpeggiator', { pattern: 2, rate: 1, gate: 0.5 }]) }])
      launch('a')
      return render(engine, BEAT * 2, chunk)
    }
    // Events on a 128-sample block edge can land a sample early or late when blocks start elsewhere (float rounding
    // in the clock), so only whole-block chunk sizes are compared exactly.
    const a = run(128)
    const b = run(1280)
    let difference = 0
    for (let i = 0; i < a.length; i++) difference += (a[i]! - b[i]!) ** 2
    expect(peak(a)).toBeGreaterThan(0.01)
    expect(difference).toBe(0)
  })
})
