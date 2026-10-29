import { describe, expect, it } from 'vitest'
import { type Patch, createDefaultFxGraph, createDefaultGroupGraph, createDefaultReturnGraph, noteGraphFrom } from '../patch'
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

interface Channel {
  readonly id: string
  readonly kind?: 'track' | 'return' | 'group'
  readonly output?: string
  readonly volume?: number
  readonly sends?: Readonly<Record<string, number>>
  readonly fx?: Patch
}

/** Audio tracks playing a steady level, returns and buses, added in the order given. */
const build = (channels: readonly Channel[]) => {
  const engine = new Engine(SAMPLE_RATE)
  engine.apply({ type: 'transport/setTempo', bpm: 120 })
  engine.apply({ type: 'sample/add', sample: { id: SAMPLE_ID, sampleRate: SAMPLE_RATE, channels: [new Float32Array(4 * BEAT).fill(LEVEL)] } })
  for (const channel of channels) {
    const common = { trackId: channel.id, volume: channel.volume ?? 1, ...(channel.output && { output: channel.output }) }
    if (channel.kind === 'return') engine.apply({ type: 'track/add', kind: 'return', fx: channel.fx ?? createDefaultReturnGraph(), ...common })
    else if (channel.kind === 'group') engine.apply({ type: 'track/add', kind: 'group', fx: channel.fx ?? createDefaultGroupGraph(), sends: channel.sends ?? {}, ...common })
    else {
      engine.apply({ type: 'track/add', kind: 'audio', fx: channel.fx ?? createDefaultFxGraph(), clips: [clip()], sends: channel.sends ?? {}, ...common })
      engine.apply({ type: 'clip/launch', trackId: channel.id, clipId: 'clip' })
    }
  }
  return engine
}

const render = (engine: Engine, frames = 4800) => {
  const left = new Float32Array(frames)
  const right = new Float32Array(frames)
  engine.render(left, right)
  return { left, right }
}

/** The (left, right) level once the sound is steady, undoing the output soft clip. */
const heard = (engine: Engine): [number, number] => {
  const { left, right } = render(engine)
  return [Math.atanh(left[4000]!), Math.atanh(right[4000]!)]
}

const level = (engine: Engine) => heard(engine)[0]

/** A return graph with a long feedback delay, so a tail is heard after its input stops. */
const echo = (): Patch =>
  noteGraphFrom(
    [{ id: 'in', type: 'groupIn' }, { id: 'd', type: 'delay', params: { time: 0.02, feedback: 0.9, mix: 1 } }, { id: 'out', type: 'trackOut' }],
    ['in.out>d.in', 'd.out>out.in'],
  )

describe('group buses in the engine', () => {
  it('at unity, sum their members exactly as the master would', () => {
    const plain = render(build([{ id: 'a' }, { id: 'b', volume: 0.5 }]))
    const bussed = render(build([{ id: 'a', output: 'g' }, { id: 'b', volume: 0.5, output: 'g' }, { id: 'g', kind: 'group' }]))
    for (let i = 0; i < plain.left.length; i++) {
      expect(Math.abs(bussed.left[i]! - plain.left[i]!)).toBeLessThan(1e-7)
      expect(Math.abs(bussed.right[i]! - plain.right[i]!)).toBeLessThan(1e-7)
    }
  })

  it('mix a bus after its members, whatever order they were added in', () => {
    expect(level(build([{ id: 'g', kind: 'group' }, { id: 'a', output: 'g' }]))).toBeCloseTo(LEVEL, 6)
  })

  it('scale the sum by the fader and pan it', () => {
    const engine = build([{ id: 'a', output: 'g' }, { id: 'b', output: 'g' }, { id: 'g', kind: 'group', volume: 0.25 }])
    expect(level(engine)).toBeCloseTo(2 * LEVEL * 0.25, 6)
    engine.apply({ type: 'track/setPan', trackId: 'g', pan: 1 })
    const [left, right] = heard(engine)
    expect(left).toBeCloseTo(0, 6)
    expect(right).toBeCloseTo(2 * LEVEL * 0.25 * Math.SQRT2, 5)
  })

  it('send to returns after the fader', () => {
    const engine = build([{ id: 'a', output: 'g' }, { id: 'g', kind: 'group', volume: 0.5, sends: { r: 1 } }, { id: 'r', kind: 'return' }])
    // The bus at half, plus the same again through the return.
    expect(level(engine)).toBeCloseTo(2 * LEVEL * 0.5, 6)
    engine.apply({ type: 'track/setVolume', trackId: 'g', volume: 0 })
    expect(level(engine)).toBeCloseTo(0, 6)
  })

  it('nest: an inner bus sums into its outer one, and its fader only reaches its own members', () => {
    const engine = build([
      { id: 'a', output: 'inner' },
      { id: 'b', output: 'outer' },
      { id: 'inner', kind: 'group', output: 'outer' },
      { id: 'outer', kind: 'group' },
    ])
    expect(level(engine)).toBeCloseTo(2 * LEVEL, 6)
    engine.apply({ type: 'track/setVolume', trackId: 'inner', volume: 0 })
    expect(level(engine)).toBeCloseTo(LEVEL, 6)
    engine.apply({ type: 'track/setVolume', trackId: 'outer', volume: 0.5 })
    expect(level(engine)).toBeCloseTo(LEVEL * 0.5, 6)
  })

  it('follow a track moved in and out of a bus', () => {
    const engine = build([{ id: 'a' }, { id: 'g', kind: 'group', volume: 0 }])
    expect(level(engine)).toBeCloseTo(LEVEL, 6)
    engine.apply({ type: 'track/setOutput', trackId: 'a', output: 'g' })
    expect(level(engine)).toBeCloseTo(0, 6)
    engine.apply({ type: 'track/setOutput', trackId: 'a', output: null })
    expect(level(engine)).toBeCloseTo(LEVEL, 6)
  })

  it('send members to the master while their bus is missing', () => {
    expect(level(build([{ id: 'a', output: 'gone' }]))).toBeCloseTo(LEVEL, 6)
  })

  it('report a peak per bus, of what it added', () => {
    const engine = build([{ id: 'a', output: 'g' }, { id: 'g', kind: 'group', volume: 0.5 }])
    render(engine)
    const status = engine.status()
    expect(status.peaks.g).toBeCloseTo(LEVEL * 0.5, 6)
    expect(status.tracks.g).toEqual({ playingClipId: null, startBeat: null, queued: null })
  })
})

describe('mute and solo through buses, on rendered audio', () => {
  const scene = () =>
    build([
      { id: 'a', output: 'g', sends: { r: 1 } },
      { id: 'b', output: 'g' },
      { id: 'c' },
      { id: 'g', kind: 'group' },
      { id: 'r', kind: 'return' },
    ])

  it('a muted bus silences its members, and keeps their sends', () => {
    const engine = scene()
    expect(level(engine)).toBeCloseTo(4 * LEVEL, 6)
    engine.apply({ type: 'track/setMute', trackId: 'g', muted: true })
    expect(level(engine)).toBeCloseTo(2 * LEVEL, 6)
  })

  it('muting the group (each member and the bus) silences the members and their reverb', () => {
    const engine = scene()
    for (const id of ['a', 'b', 'g']) engine.apply({ type: 'track/setMute', trackId: id, muted: true })
    expect(level(engine)).toBeCloseTo(LEVEL, 6)
  })

  it('a soloed member is heard through its bus, with its reverb', () => {
    const engine = scene()
    engine.apply({ type: 'track/setSolo', trackId: 'a', soloed: true })
    expect(level(engine)).toBeCloseTo(2 * LEVEL, 6)
    engine.apply({ type: 'track/setVolume', trackId: 'g', volume: 0 })
    expect(level(engine)).toBeCloseTo(LEVEL, 6)
  })

  it('a soloed group: its members are heard, the other tracks are not', () => {
    const engine = scene()
    for (const id of ['a', 'b', 'g']) engine.apply({ type: 'track/setSolo', trackId: id, soloed: true })
    expect(level(engine)).toBeCloseTo(3 * LEVEL, 6)
  })

  it('a soloed member of a muted bus is heard only through its sends', () => {
    const engine = scene()
    for (const id of ['a', 'b', 'g']) engine.apply({ type: 'track/setMute', trackId: id, muted: true })
    engine.apply({ type: 'track/setSolo', trackId: 'a', soloed: true })
    expect(level(engine)).toBeCloseTo(LEVEL, 6)
  })

  it('soloing the return keeps the members\' sends', () => {
    const engine = scene()
    engine.apply({ type: 'track/setSolo', trackId: 'r', soloed: true })
    expect(level(engine)).toBeCloseTo(LEVEL, 6)
  })

  it('a muted bus keeps running its effects, so their tail rings on after it is unmuted', () => {
    const engine = build([{ id: 'a', output: 'g' }, { id: 'g', kind: 'group', fx: echo() }])
    render(engine)
    engine.apply({ type: 'track/setMute', trackId: 'g', muted: true })
    engine.apply({ type: 'track/stop', trackId: 'a' })
    expect(Math.max(...render(engine).left.map(Math.abs))).toBe(0)
    engine.apply({ type: 'track/setMute', trackId: 'g', muted: false })
    engine.apply({ type: 'track/setVolume', trackId: 'a', volume: 0 })
    expect(Math.max(...render(engine, 480).left.map(Math.abs))).toBeGreaterThan(0.001)
  })
})
