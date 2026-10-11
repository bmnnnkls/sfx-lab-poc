import { describe, expect, it } from 'vitest'
import { type Patch, createDefaultFxGraph, createDefaultMasterGraph, noteGraphFrom } from '../patch'
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

/** Two audio tracks of a constant 0.1, so the mix is 0.2 before the master. */
const build = (master?: Patch) => {
  const engine = new Engine(SAMPLE_RATE)
  engine.apply({ type: 'transport/setTempo', bpm: 120 })
  engine.apply({ type: 'sample/add', sample: { id: SAMPLE_ID, sampleRate: SAMPLE_RATE, data: new Float32Array(4 * BEAT).fill(LEVEL) } })
  for (const id of ['a', 'b']) {
    engine.apply({ type: 'track/add', kind: 'audio', trackId: id, fx: createDefaultFxGraph(), clips: [clip()], volume: 1 })
    engine.apply({ type: 'clip/launch', trackId: id, clipId: 'clip' })
  }
  if (master) engine.apply({ type: 'master/setFx', graph: master })
  return engine
}

const render = (engine: Engine, frames: number) => {
  const left = new Float32Array(frames)
  const right = new Float32Array(frames)
  engine.render(left, right)
  return { left, right }
}

const through = (type: string, params: Record<string, number> = {}): Patch =>
  noteGraphFrom([{ id: 'in', type: 'masterIn' }, { id: 'fx', type, params }, { id: 'out', type: 'trackOut' }], ['in.out>fx.in', 'fx.out>out.in'])

describe('master graph', () => {
  it('leaves the mix alone by default, and the same when set to the default graph', () => {
    const plain = render(build(), 4800)
    const explicit = render(build(createDefaultMasterGraph()), 4800)
    expect(plain.left[4000]).toBeCloseTo(Math.tanh(0.2), 6)
    expect(explicit.left).toEqual(plain.left)
    expect(explicit.right).toEqual(plain.right)
  })

  it('processes the sum of all tracks, here a gain of a half, before the soft clip', () => {
    const { left, right } = render(build(through('gain', { gain: 0.5 })), 4800)
    expect(left[4000]).toBeCloseTo(Math.tanh(0.1), 6)
    expect(right[4000]).toBeCloseTo(left[4000]!, 12)
  })

  it('runs in stereo: a mono effect needs the stereo switch, a stereo one works as it is', () => {
    const wide = render(build(through('stereoReverb', { mix: 1, size: 0.8 })), 24000)
    expect(Math.max(...wide.left)).toBeGreaterThan(0.005)
    expect(wide.left).not.toEqual(wide.right)
  })

  it('keeps its tails after the tracks stop', () => {
    const engine = build(through('delay', { time: 0.1, feedback: 0.7, mix: 1 }))
    render(engine, 12000)
    engine.apply({ type: 'transport/stop' })
    const { left } = render(engine, 12000) // the tracks are reset, the master graph is not
    expect(Math.max(...left.map(Math.abs))).toBeGreaterThan(0.01)
  })

  it('takes a knob turn without losing state, and a new graph while playing', () => {
    const graph = through('delay', { time: 0.1, feedback: 0.7, mix: 1 })
    const engine = build(graph)
    render(engine, 6000)
    engine.apply({ type: 'transport/stop' })
    engine.apply({ type: 'master/setParam', nodeId: 'fx', paramId: 'feedback', value: 0.6 })
    expect(Math.max(...render(engine, 4800).left.map(Math.abs))).toBeGreaterThan(0.01)
    engine.apply({ type: 'master/setFx', graph: createDefaultMasterGraph() })
    expect(Math.max(...render(engine, 4800).left.map(Math.abs))).toBe(0)
  })

  it('does not process a sample being auditioned, which is not part of the mix', () => {
    const engine = new Engine(SAMPLE_RATE)
    engine.apply({ type: 'sample/add', sample: { id: SAMPLE_ID, sampleRate: SAMPLE_RATE, data: new Float32Array(48000).fill(LEVEL) } })
    engine.apply({ type: 'master/setFx', graph: through('gain', { gain: 0 }) })
    engine.apply({ type: 'sample/preview', sampleId: SAMPLE_ID })
    expect(render(engine, 4800).left[4000]).toBeGreaterThan(0.05)
  })

  it('processes everything that is in the mix, so a master gain of zero silences all of it', () => {
    const engine = build(through('gain', { gain: 0 }))
    expect(Math.max(...render(engine, 4800).left.map(Math.abs))).toBe(0)
  })
})
