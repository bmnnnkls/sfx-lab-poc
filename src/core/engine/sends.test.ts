import { describe, expect, it } from 'vitest'
import { type Patch, noteGraphFrom } from '../patch'
import type { AudioClip } from '../project'
import { Engine } from './engine'

const SAMPLE_RATE = 48000
const BEAT = 24000
const SAMPLE_ID = 'a'.repeat(64)
const LEVEL = 0.1

const audioClip = (): AudioClip => ({
  id: 'clip', name: 'clip', sampleId: SAMPLE_ID, lengthBeats: 4, loop: true, warp: 'repitch',
  gain: 1, start: 0, end: 1, fadeIn: 0, fadeOut: 0,
})

/** Track in -> Track out, plus Track in -> Send(`target`, `amount`). The send can also sit after a gain (`gain`). */
const sending = (target: string, amount: number, gain?: number): Patch =>
  noteGraphFrom(
    [
      { id: 'in', type: 'trackIn' },
      ...(gain === undefined ? [] : [{ id: 'g', type: 'gain', params: { gain } }]),
      { id: 'send', type: 'send', params: { amount }, trackId: target },
      { id: 'out', type: 'trackOut' },
    ],
    gain === undefined ? ['in.out>out.in', 'in.out>send.in'] : ['in.out>out.in', 'in.out>g.in', 'g.out>send.in'],
  )

/** What the return does: its input through a gain. */
const returning = (gain: number): Patch =>
  noteGraphFrom([{ id: 'in', type: 'returnIn' }, { id: 'g', type: 'gain', params: { gain } }, { id: 'out', type: 'trackOut' }], ['in.out>g.in', 'g.out>out.in'])

type Part = { id: string; fx: Patch; volume?: number } | { id: string; ret: Patch; volume?: number }

const build = (parts: Part[]) => {
  const engine = new Engine(SAMPLE_RATE)
  engine.apply({ type: 'transport/setTempo', bpm: 120 })
  engine.apply({ type: 'sample/add', sample: { id: SAMPLE_ID, sampleRate: SAMPLE_RATE, data: new Float32Array(4 * BEAT).fill(LEVEL) } })
  for (const part of parts) {
    if ('ret' in part) engine.apply({ type: 'track/add', kind: 'return', trackId: part.id, fx: part.ret, volume: part.volume ?? 1 })
    else engine.apply({ type: 'track/add', kind: 'audio', trackId: part.id, fx: part.fx, clips: [audioClip()], volume: part.volume ?? 1 })
  }
  for (const part of parts) if (!('ret' in part)) engine.apply({ type: 'clip/launch', trackId: part.id, clipId: 'clip' })
  return engine
}

const render = (engine: Engine, frames: number) => {
  const left = new Float32Array(frames)
  const right = new Float32Array(frames)
  engine.render(left, right)
  return { left, right }
}

/** The level at the end of a short render (the sound is steady by then). */
const settled = (engine: Engine) => {
  const { left, right } = render(engine, 4800)
  return { left: left[4000]!, right: right[4000]! }
}

describe('sends and return tracks', () => {
  const parts = (): Part[] => [
    { id: 'a', fx: sending('r', 1) },
    { id: 'b', fx: sending('r', 0.5) },
    { id: 'r', ret: returning(0.5) },
  ]

  it('two tracks sending to one return add up in it', () => {
    // two dry tracks (0.1 each) + the return's gain 0.5 on (0.1 * 1 + 0.1 * 0.5)
    const { left, right } = settled(build(parts()))
    expect(left).toBeCloseTo(Math.tanh(0.1 + 0.1 + 0.075), 5)
    expect(right).toBeCloseTo(left, 9)
  })

  it('does not matter in which order the tracks were added', () => {
    const forward = settled(build(parts()))
    const backward = settled(build(parts().reverse()))
    const middle = settled(build([parts()[0]!, parts()[2]!, parts()[1]!]))
    expect(backward.left).toBeCloseTo(forward.left, 9)
    expect(middle.left).toBeCloseTo(forward.left, 9)
  })

  it('a send takes the signal where it sits in the graph, here before the track fader', () => {
    // The track is turned all the way down but its send still reaches the return.
    const { left } = settled(build([{ id: 'a', fx: sending('r', 1), volume: 0 }, { id: 'r', ret: returning(1) }]))
    expect(left).toBeCloseTo(Math.tanh(0.1), 5)
  })

  it('a send placed after an effect sends the processed sound', () => {
    const { left } = settled(build([{ id: 'a', fx: sending('r', 1, 0.5), volume: 0 }, { id: 'r', ret: returning(1) }]))
    expect(left).toBeCloseTo(Math.tanh(0.05), 5)
  })

  it('a return is silent while nothing sends to it, and so is a track that sends to nothing', () => {
    expect(settled(build([{ id: 'r', ret: returning(1) }])).left).toBe(0)
    expect(settled(build([{ id: 'a', fx: sending('nowhere', 1), volume: 0 }, { id: 'r', ret: returning(1) }])).left).toBe(0)
  })

  it('the return has its own volume', () => {
    const { left } = settled(build([{ id: 'a', fx: sending('r', 1), volume: 0 }, { id: 'r', ret: returning(1), volume: 0.5 }]))
    expect(left).toBeCloseTo(Math.tanh(0.05), 5)
  })

  it('a return may send to a later return', () => {
    const chain = build([
      { id: 'a', fx: sending('r1', 1), volume: 0 },
      { id: 'r2', ret: returning(1) },
      { id: 'r1', ret: noteGraphFrom([{ id: 'in', type: 'returnIn' }, { id: 'send', type: 'send', trackId: 'r2' }, { id: 'out', type: 'trackOut' }], ['in.out>send.in']) },
    ])
    expect(settled(chain).left).toBeCloseTo(Math.tanh(0.1), 5)
  })

  it('removing the return leaves the senders playing and nothing crashing', () => {
    const engine = build(parts())
    settled(engine)
    engine.apply({ type: 'track/remove', trackId: 'r' })
    const { left } = settled(engine)
    expect(left).toBeCloseTo(Math.tanh(0.2), 5)
  })

  it('changing the sending graph while playing re-targets the send', () => {
    const engine = build([{ id: 'a', fx: sending('r1', 1), volume: 0 }, { id: 'r1', ret: returning(1) }, { id: 'r2', ret: returning(0.5) }])
    expect(settled(engine).left).toBeCloseTo(Math.tanh(0.1), 5)
    engine.apply({ type: 'track/setFx', trackId: 'a', graph: sending('r2', 1) })
    expect(settled(engine).left).toBeCloseTo(Math.tanh(0.05), 5)
  })

  it('a knob on the Send changes the amount without rebuilding anything', () => {
    const fx = sending('r', 1)
    const engine = build([{ id: 'a', fx, volume: 0 }, { id: 'r', ret: returning(1) }])
    settled(engine)
    engine.apply({ type: 'track/setParam', trackId: 'a', nodeId: 'send', paramId: 'amount', value: 0.25 })
    expect(settled(engine).left).toBeCloseTo(Math.tanh(0.025), 5)
  })

  it('return tracks that send to each other in a loop do not crash or blow up', () => {
    const toOther = (target: string) => noteGraphFrom([{ id: 'in', type: 'returnIn' }, { id: 'send', type: 'send', trackId: target }, { id: 'out', type: 'trackOut' }], ['in.out>send.in', 'in.out>out.in'])
    const engine = build([{ id: 'a', fx: sending('r1', 1), volume: 0 }, { id: 'r1', ret: toOther('r2') }, { id: 'r2', ret: toOther('r1') }])
    const { left } = render(engine, 24000)
    expect(left.every(Number.isFinite)).toBe(true)
    expect(Math.max(...left.map(Math.abs))).toBeLessThan(1)
  })

  it('a mono sample sent through a stereo reverb comes back wide', () => {
    const wide = noteGraphFrom([{ id: 'in', type: 'returnIn' }, { id: 'r', type: 'stereoReverb', params: { mix: 1, size: 0.8 } }, { id: 'out', type: 'trackOut' }], ['in.out>r.in', 'r.out>out.in'])
    const { left, right } = render(build([{ id: 'a', fx: sending('r', 1), volume: 0 }, { id: 'r', ret: wide }]), 24000)
    expect(Math.max(...left)).toBeGreaterThan(0.005)
    expect(left).not.toEqual(right)
  })
})
