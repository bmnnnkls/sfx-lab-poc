import { describe, expect, it } from 'vitest'
import { type Patch, createDefaultNoteGraph, noteGraphFrom } from '../patch'
import { createClip, createNote } from '../project'
import { Engine } from './engine'

const SAMPLE_RATE = 48000
const BEAT = (bpm: number) => (60 / bpm) * SAMPLE_RATE

/** A Clock counting beats (one cycle a beat) wired to the sink, so the track's output is a square wave that follows the tempo. */
const clocked = (source: string | null, sink: string): Patch =>
  noteGraphFrom(
    [...(source ? [{ id: 'in', type: source }] : []), { id: 'clock', type: 'clock', params: { rate: 1, unit: 2 } }, { id: 'out', type: sink }],
    ['clock.out>out.in'],
  )

const edgesOf = (signal: Float32Array): number[] => {
  const found: number[] = []
  signal.forEach((value, i) => {
    if (value > 0.4 && (signal[i - 1] ?? 0) <= 0.4) found.push(i)
  })
  return found
}
const gaps = (edges: readonly number[]) => edges.slice(1).map((at, i) => at - edges[i]!)

const render = (engine: Engine, frames: number): Float32Array => {
  const left = new Float32Array(frames)
  engine.render(left, new Float32Array(frames))
  return left
}

type Add = (engine: Engine) => void
const KINDS: Record<string, Add> = {
  'an audio track': (engine) =>
    engine.apply({ type: 'track/add', kind: 'audio', trackId: 't', fx: clocked('trackIn', 'trackOut'), clips: [], volume: 1 }),
  'a return track': (engine) =>
    engine.apply({ type: 'track/add', kind: 'return', trackId: 't', fx: clocked('returnIn', 'trackOut'), volume: 1 }),
  'an instrument track (insert graph)': (engine) =>
    engine.apply({
      type: 'track/add', kind: 'instrument', trackId: 't', patch: { nodes: [], connections: [] }, noteGraph: createDefaultNoteGraph(),
      fx: clocked('trackIn', 'trackOut'), clips: [], volume: 1, voices: 2,
    }),
}

describe('tempo reaches the nodes', () => {
  it.each(Object.keys(KINDS))('%s that already exists is told when the tempo changes', (kind) => {
    const engine = new Engine(SAMPLE_RATE)
    KINDS[kind]!(engine)
    engine.apply({ type: 'transport/setTempo', bpm: 90 })
    const edges = edgesOf(render(engine, Math.round(BEAT(90) * 4.5)))
    expect(edges).toHaveLength(5)
    gaps(edges).forEach((gap) => expect(Math.abs(gap - BEAT(90))).toBeLessThanOrEqual(2))
  })

  it.each(Object.keys(KINDS))('%s added after the tempo was set starts with it', (kind) => {
    const engine = new Engine(SAMPLE_RATE)
    engine.apply({ type: 'transport/setTempo', bpm: 140 })
    KINDS[kind]!(engine)
    const edges = edgesOf(render(engine, Math.round(BEAT(140) * 4.5)))
    expect(edges).toHaveLength(5)
    gaps(edges).forEach((gap) => expect(Math.abs(gap - BEAT(140))).toBeLessThanOrEqual(2))
  })

  it('a track added with no tempo command is at 120', () => {
    const engine = new Engine(SAMPLE_RATE)
    KINDS['an audio track']!(engine)
    gaps(edgesOf(render(engine, 100000))).forEach((gap) => expect(Math.abs(gap - 24000)).toBeLessThanOrEqual(2))
  })

  it('the master graph follows the tempo, also one set after the tempo', () => {
    const before = new Engine(SAMPLE_RATE)
    before.apply({ type: 'master/setFx', graph: clocked('masterIn', 'trackOut') })
    before.apply({ type: 'transport/setTempo', bpm: 60 })
    const after = new Engine(SAMPLE_RATE)
    after.apply({ type: 'transport/setTempo', bpm: 60 })
    after.apply({ type: 'master/setFx', graph: clocked('masterIn', 'trackOut') })
    for (const engine of [before, after]) {
      const edges = edgesOf(render(engine, 48000 * 3 + 100))
      expect(edges).toHaveLength(4)
      gaps(edges).forEach((gap) => expect(Math.abs(gap - 48000)).toBeLessThanOrEqual(2))
    }
  })

  it('a patch clock inside a voice follows it too (instrument stages)', () => {
    const engine = new Engine(SAMPLE_RATE)
    const clip = createClip('held', 64, [createNote(60, 0, 60, 1)])
    engine.apply({ type: 'transport/setTempo', bpm: 90 })
    engine.apply({
      type: 'track/add', kind: 'instrument', trackId: 't', patch: clocked(null, 'output'), noteGraph: createDefaultNoteGraph(),
      fx: noteGraphFrom([{ id: 'in', type: 'trackIn' }, { id: 'out', type: 'trackOut' }], ['in.out>out.in']), clips: [clip], volume: 1, voices: 2,
    })
    engine.apply({ type: 'clip/launch', trackId: 't', clipId: clip.id })
    const edges = edgesOf(render(engine, Math.round(BEAT(90) * 4.5)))
    expect(edges.length).toBeGreaterThanOrEqual(4)
    gaps(edges).forEach((gap) => expect(Math.abs(gap - BEAT(90))).toBeLessThanOrEqual(2))
  })

  it('changing the tempo while it runs changes the next cycle', () => {
    const engine = new Engine(SAMPLE_RATE)
    KINDS['an audio track']!(engine)
    const first = render(engine, 24000 * 2) // two beats at 120 BPM
    engine.apply({ type: 'transport/setTempo', bpm: 60 })
    const rest = render(engine, 48000 * 3)
    const edges = [...edgesOf(first), ...edgesOf(rest).map((at) => at + first.length)]
    const g = gaps(edges)
    expect(Math.abs(g[0]! - 24000)).toBeLessThanOrEqual(2)
    // The cycle that began at 24000 was cut at the next block edge by the change, and the ones after are slow beats.
    expect(g.slice(-2).every((gap) => Math.abs(gap - 48000) <= 2)).toBe(true)
  })

  it('a rebuilt insert graph or instrument keeps the tempo', () => {
    const engine = new Engine(SAMPLE_RATE)
    KINDS['an audio track']!(engine)
    engine.apply({ type: 'transport/setTempo', bpm: 90 })
    engine.apply({ type: 'track/setFx', trackId: 't', graph: clocked('trackIn', 'trackOut') })
    const edges = edgesOf(render(engine, Math.round(BEAT(90) * 3.5)))
    gaps(edges).forEach((gap) => expect(Math.abs(gap - BEAT(90))).toBeLessThanOrEqual(2))
    expect(edges).toHaveLength(4)

    const instrument = new Engine(SAMPLE_RATE)
    const clip = createClip('held', 64, [createNote(60, 0, 60, 1)])
    instrument.apply({ type: 'transport/setTempo', bpm: 90 })
    instrument.apply({
      type: 'track/add', kind: 'instrument', trackId: 't', patch: { nodes: [], connections: [] }, noteGraph: createDefaultNoteGraph(),
      fx: noteGraphFrom([{ id: 'in', type: 'trackIn' }, { id: 'out', type: 'trackOut' }], ['in.out>out.in']), clips: [clip], volume: 1, voices: 2,
    })
    // Both rebuild the instrument: it must start with the tempo the track has, not with 120.
    instrument.apply({ type: 'track/setPatch', trackId: 't', patch: clocked(null, 'output') })
    instrument.apply({ type: 'track/setVoices', trackId: 't', voices: 3 })
    instrument.apply({ type: 'clip/launch', trackId: 't', clipId: clip.id })
    const edgesAfter = edgesOf(render(instrument, Math.round(BEAT(90) * 3.5)))
    expect(edgesAfter.length).toBeGreaterThanOrEqual(3)
    gaps(edgesAfter).forEach((gap) => expect(Math.abs(gap - BEAT(90))).toBeLessThanOrEqual(2))
  })
})
