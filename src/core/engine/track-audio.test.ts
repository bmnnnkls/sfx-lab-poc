import { describe, expect, it } from 'vitest'
import { type Patch, createDefaultFxGraph, noteGraphFrom } from '../patch'
import type { AudioClip } from '../project'
import { Engine } from './engine'

const SAMPLE_RATE = 48000
const BEAT = 24000
const SAMPLE_ID = 'a'.repeat(64)
const LEVEL = 0.1

const clip = (): AudioClip => ({
  id: 'clip', name: 'clip', sampleId: SAMPLE_ID, lengthBeats: 4, loop: true, warp: 'repitch',
  gain: 1, start: 0, end: 1, fadeIn: 0, fadeOut: 0,
})

const gained = (gain: number): Patch =>
  noteGraphFrom([{ id: 'in', type: 'trackIn' }, { id: 'g', type: 'gain', params: { gain } }, { id: 'out', type: 'trackOut' }], ['in.out>g.in', 'g.out>out.in'])

/** A graph that ignores the track's own sound and plays `source`'s instead (`tap` 0 before its effects, 1 after). */
const takingFrom = (source: string, tap: number, keepOwn = false): Patch =>
  noteGraphFrom(
    [{ id: 'in', type: 'trackIn' }, { id: 'ta', type: 'trackAudio', trackId: source, params: { tap } }, { id: 'out', type: 'trackOut' }],
    keepOwn ? ['in.out>out.in', 'ta.out>out.in'] : ['ta.out>out.in'],
  )

/** The patch with the given nodes running in stereo (the compact builder does not know about it). */
const withStereo = (patch: Patch, ...ids: string[]): Patch => ({ ...patch, nodes: patch.nodes.map((node) => (ids.includes(node.id) ? { ...node, stereo: true } : node)) })

type Part = { id: string; fx: Patch; volume?: number; silentClip?: boolean } | { id: string; ret: Patch }

const build = (parts: Part[]) => {
  const engine = new Engine(SAMPLE_RATE)
  engine.apply({ type: 'transport/setTempo', bpm: 120 })
  engine.apply({ type: 'sample/add', sample: { id: SAMPLE_ID, sampleRate: SAMPLE_RATE, data: new Float32Array(4 * BEAT).fill(LEVEL) } })
  for (const part of parts) {
    if ('ret' in part) engine.apply({ type: 'track/add', kind: 'return', trackId: part.id, fx: part.ret, volume: 1 })
    else engine.apply({ type: 'track/add', kind: 'audio', trackId: part.id, fx: part.fx, clips: part.silentClip ? [null] : [clip()], volume: part.volume ?? 1 })
  }
  for (const part of parts) if (!('ret' in part) && !part.silentClip) engine.apply({ type: 'clip/launch', trackId: part.id, clipId: 'clip' })
  return engine
}

const render = (engine: Engine, frames: number) => {
  const left = new Float32Array(frames)
  const right = new Float32Array(frames)
  engine.render(left, right)
  return { left, right }
}
const settled = (engine: Engine) => render(engine, 4800).left[4000]!

describe('Track audio', () => {
  it('plays another track\'s sound after its effects: here a gain of a half', () => {
    // "src" is 0.1 through a gain of 0.5 = 0.05; "copy" has no clip, only what it takes from src. Fader of src is down.
    const engine = build([{ id: 'src', fx: gained(0.5), volume: 0 }, { id: 'copy', fx: takingFrom('src', 1), silentClip: true }])
    expect(settled(engine)).toBeCloseTo(Math.tanh(0.05), 5)
  })

  it('plays it before the effects when asked to', () => {
    const engine = build([{ id: 'src', fx: gained(0.5), volume: 0 }, { id: 'copy', fx: takingFrom('src', 0), silentClip: true }])
    expect(settled(engine)).toBeCloseTo(Math.tanh(0.1), 5)
  })

  it('takes the sound before the source\'s fader, so a track turned all the way down can still be used', () => {
    const engine = build([{ id: 'src', fx: createDefaultFxGraph(), volume: 0 }, { id: 'copy', fx: takingFrom('src', 1), silentClip: true }])
    expect(settled(engine)).toBeCloseTo(Math.tanh(0.1), 5)
  })

  it('adds to what the reading track plays itself, and the source keeps sounding as normal', () => {
    // src 0.1 (heard) + copy's own 0.1 + src's 0.1 taken
    const engine = build([{ id: 'src', fx: createDefaultFxGraph() }, { id: 'copy', fx: takingFrom('src', 1, true) }])
    expect(settled(engine)).toBeCloseTo(Math.tanh(0.3), 5)
  })

  it('does not matter in which order the tracks were added', () => {
    const parts: Part[] = [{ id: 'src', fx: gained(0.5), volume: 0 }, { id: 'copy', fx: takingFrom('src', 1), silentClip: true }]
    expect(settled(build([...parts].reverse()))).toBeCloseTo(settled(build(parts)), 9)
    expect(settled(build([...parts].reverse()))).toBeCloseTo(Math.tanh(0.05), 5)
  })

  it('works through chains: a track taking from a track that takes from another', () => {
    const engine = build([
      { id: 'c', fx: takingFrom('b', 1), silentClip: true },
      { id: 'b', fx: takingFrom('a', 1), silentClip: true, volume: 0 },
      { id: 'a', fx: gained(0.5), volume: 0 },
    ])
    expect(settled(engine)).toBeCloseTo(Math.tanh(0.05), 5)
  })

  it('can take the sound of a return track, before or after its effects', () => {
    const returning = withStereo(
      noteGraphFrom([{ id: 'in', type: 'returnIn' }, { id: 'g', type: 'gain', params: { gain: 0.5 } }, { id: 'out', type: 'trackOut' }], ['in.out>g.in', 'g.out>out.in']),
      'g',
    )
    const sender = noteGraphFrom([{ id: 'in', type: 'trackIn' }, { id: 's', type: 'send', trackId: 'r' }, { id: 'out', type: 'trackOut' }], ['in.out>s.in'])
    const withTap = (tap: number) =>
      build([
        { id: 'src', fx: sender, volume: 0 },
        { id: 'r', ret: returning },
        { id: 'copy', fx: takingFrom('r', tap), silentClip: true },
      ])
    // The return is heard too, halved (0.05). Before its gain the copy takes 0.1, after it 0.05.
    expect(settled(withTap(0))).toBeCloseTo(Math.tanh(0.05 + 0.1), 5)
    expect(settled(withTap(1))).toBeCloseTo(Math.tanh(0.05 + 0.05), 5)
  })

  it('is silent when no track is chosen, when the track is gone, and when a track takes from itself', () => {
    expect(settled(build([{ id: 'copy', fx: takingFrom('', 1), silentClip: true }]))).toBe(0)
    expect(settled(build([{ id: 'copy', fx: takingFrom('ghost', 1), silentClip: true }]))).toBe(0)
    expect(settled(build([{ id: 'copy', fx: takingFrom('copy', 1), silentClip: true }]))).toBe(0)
  })

  it('stops reading when the source is removed, without a crash', () => {
    const engine = build([{ id: 'src', fx: createDefaultFxGraph(), volume: 0 }, { id: 'copy', fx: takingFrom('src', 1), silentClip: true }])
    expect(settled(engine)).toBeGreaterThan(0.05)
    engine.apply({ type: 'track/remove', trackId: 'src' })
    expect(settled(engine)).toBe(0)
  })

  it('tracks that take audio from each other in a loop do not crash or blow up', () => {
    const engine = build([{ id: 'a', fx: takingFrom('b', 1, true) }, { id: 'b', fx: takingFrom('a', 1, true) }])
    const { left } = render(engine, 24000)
    expect(left.every(Number.isFinite)).toBe(true)
    expect(Math.max(...left.map(Math.abs))).toBeLessThan(1)
  })

  it('a track that takes audio from another is mixed after it, however they were added', () => {
    const engine = build([{ id: 'a', fx: takingFrom('b', 1), silentClip: true }, { id: 'b', fx: createDefaultFxGraph() }])
    expect(settled(engine)).toBeCloseTo(Math.tanh(0.2), 5) // b is heard (0.1) and a plays b's sound (0.1)
  })

  it('can modulate: through Mono sum into a Gain\'s CV, the other track scales this one', () => {
    const modulated = withStereo(
      noteGraphFrom(
        [{ id: 'in', type: 'trackIn' }, { id: 'ta', type: 'trackAudio', trackId: 'src', params: { tap: 1 } }, { id: 'sum', type: 'monoSum' }, { id: 'g', type: 'gain' }, { id: 'out', type: 'trackOut' }],
        ['in.out>g.in', 'ta.out>sum.in', 'sum.out>g.cv', 'g.out>out.in'],
      ),
      'g',
    )
    // The copy plays 0.1 itself, scaled by the source's 0.1: 0.01. The source is turned all the way down.
    const engine = build([{ id: 'src', fx: createDefaultFxGraph(), volume: 0 }, { id: 'copy', fx: modulated }])
    expect(settled(engine)).toBeCloseTo(Math.tanh(0.01), 5)
  })
})
