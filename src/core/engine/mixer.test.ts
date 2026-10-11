import { describe, expect, it } from 'vitest'
import { type Patch, createDefaultFxGraph, createDefaultReturnGraph, noteGraphFrom } from '../patch'
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

/** Track in -> Track out, plus Track in -> Send(`target`). */
const sendingTo = (target: string): Patch =>
  noteGraphFrom(
    [{ id: 'in', type: 'trackIn' }, { id: 'send', type: 'send', params: { amount: 1 }, trackId: target }, { id: 'out', type: 'trackOut' }],
    ['in.out>out.in', 'in.out>send.in'],
  )

/** Plays `source`'s sound and nothing else. */
const takingFrom = (source: string): Patch =>
  noteGraphFrom(
    [{ id: 'in', type: 'trackIn' }, { id: 'ta', type: 'trackAudio', trackId: source, params: { tap: 1 } }, { id: 'out', type: 'trackOut' }],
    ['ta.out>out.in'],
  )

interface Part {
  readonly id: string
  readonly fx?: Patch
  readonly kind?: 'audio' | 'return'
  /** No clip of its own (a return, or a track that only takes sound from another). */
  readonly silent?: boolean
  readonly volume?: number
}

const build = (parts: readonly Part[]) => {
  const engine = new Engine(SAMPLE_RATE)
  engine.apply({ type: 'transport/setTempo', bpm: 120 })
  engine.apply({ type: 'sample/add', sample: { id: SAMPLE_ID, sampleRate: SAMPLE_RATE, data: new Float32Array(4 * BEAT).fill(LEVEL) } })
  for (const part of parts) {
    if (part.kind === 'return') {
      engine.apply({ type: 'track/add', kind: 'return', trackId: part.id, fx: part.fx ?? createDefaultReturnGraph(), volume: part.volume ?? 1 })
    } else {
      const clips = part.silent ? [null] : [clip()]
      engine.apply({ type: 'track/add', kind: 'audio', trackId: part.id, fx: part.fx ?? createDefaultFxGraph(), clips, volume: part.volume ?? 1 })
      if (!part.silent) engine.apply({ type: 'clip/launch', trackId: part.id, clipId: 'clip' })
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

describe('pan', () => {
  it('centred, a track sounds exactly as it did before there was a pan', () => {
    const [left, right] = heard(build([{ id: 'a' }]))
    expect(left).toBeCloseTo(LEVEL, 6)
    expect(right).toBeCloseTo(LEVEL, 6)
  })

  it('moves the sound to the side: all left, all right, and in between', () => {
    const engine = build([{ id: 'a' }])
    engine.apply({ type: 'track/setPan', trackId: 'a', pan: -1 })
    const [l1, r1] = heard(engine)
    expect(l1).toBeCloseTo(LEVEL * Math.SQRT2, 5)
    expect(r1).toBeCloseTo(0, 5)
    engine.apply({ type: 'track/setPan', trackId: 'a', pan: 1 })
    const [l2, r2] = heard(engine)
    expect(l2).toBeCloseTo(0, 5)
    expect(r2).toBeCloseTo(LEVEL * Math.SQRT2, 5)
    engine.apply({ type: 'track/setPan', trackId: 'a', pan: 0.5 })
    const [l3, r3] = heard(engine)
    expect(r3).toBeGreaterThan(l3)
    expect(l3).toBeGreaterThan(0)
  })

  it('keeps the power the same wherever the sound sits (constant-power law)', () => {
    const engine = build([{ id: 'a' }])
    const powers = [-1, -0.7, -0.25, 0, 0.1, 0.6, 1].map((pan) => {
      engine.apply({ type: 'track/setPan', trackId: 'a', pan })
      const [l, r] = heard(engine)
      return l * l + r * r
    })
    for (const power of powers) expect(power).toBeCloseTo(2 * LEVEL * LEVEL, 5)
  })

  it('works on top of the fader, and the post-fader send knob carries the sound unpanned', () => {
    const engine = build([{ id: 'a', volume: 0.5 }, { id: 'r', kind: 'return', silent: true }])
    engine.apply({ type: 'track/setSends', trackId: 'a', sends: { r: 1 } })
    engine.apply({ type: 'track/setPan', trackId: 'a', pan: -1 })
    // Track: 0.05 * sqrt2 left and nothing right. Send: 0.05 into the return, in both channels.
    const [left, right] = heard(engine)
    expect(left).toBeCloseTo(0.05 * Math.SQRT2 + 0.05, 5)
    expect(right).toBeCloseTo(0.05, 5)
  })

  it('applies to a return track too', () => {
    const engine = build([{ id: 'a', fx: sendingTo('r'), volume: 0 }, { id: 'r', kind: 'return', silent: true }])
    engine.apply({ type: 'track/setPan', trackId: 'r', pan: 1 })
    const [left, right] = heard(engine)
    expect(left).toBeCloseTo(0, 5)
    expect(right).toBeCloseTo(LEVEL * Math.SQRT2, 5)
  })
})

describe('mute', () => {
  it('silences the track in the output, and unmuting brings it back', () => {
    const engine = build([{ id: 'a' }, { id: 'b' }])
    engine.apply({ type: 'track/setMute', trackId: 'a', muted: true })
    expect(heard(engine)[0]).toBeCloseTo(LEVEL, 6)
    engine.apply({ type: 'track/setMute', trackId: 'b', muted: true })
    expect(render(engine).left[4000]).toBe(0)
    engine.apply({ type: 'track/setMute', trackId: 'a', muted: false })
    expect(heard(engine)[0]).toBeCloseTo(LEVEL, 6)
  })

  it('also silences the track\'s sends (Send node and knob), but not the other tracks\' sends', () => {
    const engine = build([
      { id: 'a', fx: sendingTo('r'), volume: 0 },
      { id: 'b', fx: sendingTo('r'), volume: 0 },
      { id: 'r', kind: 'return', silent: true },
    ])
    expect(heard(engine)[0]).toBeCloseTo(2 * LEVEL, 5)
    engine.apply({ type: 'track/setMute', trackId: 'a', muted: true })
    expect(heard(engine)[0]).toBeCloseTo(LEVEL, 5)
    engine.apply({ type: 'track/setSends', trackId: 'b', sends: { r: 1 } })
    engine.apply({ type: 'track/setMute', trackId: 'b', muted: true })
    expect(render(engine).left[4000]).toBe(0)
  })

  it('keeps the effects running and the track\'s sound available to Track audio nodes', () => {
    const engine = build([{ id: 'src' }, { id: 'copy', fx: takingFrom('src'), silent: true }])
    engine.apply({ type: 'track/setMute', trackId: 'src', muted: true })
    // src is not heard itself, but copy still plays what src makes.
    expect(heard(engine)[0]).toBeCloseTo(LEVEL, 5)
  })

  it('lets a muted return keep running: unmuting it hears the tail it kept making', () => {
    const engine = build([{ id: 'a', fx: sendingTo('r'), volume: 0 }, { id: 'r', kind: 'return', silent: true }])
    engine.apply({ type: 'track/setMute', trackId: 'r', muted: true })
    expect(render(engine).left[4000]).toBe(0)
    engine.apply({ type: 'track/setMute', trackId: 'r', muted: false })
    expect(heard(engine)[0]).toBeCloseTo(LEVEL, 5)
  })
})

describe('solo', () => {
  it('silences every track that is not soloed', () => {
    const engine = build([{ id: 'a', volume: 1 }, { id: 'b', volume: 0.5 }])
    engine.apply({ type: 'track/setSolo', trackId: 'b', soloed: true })
    expect(heard(engine)[0]).toBeCloseTo(0.05, 5)
    engine.apply({ type: 'track/setSolo', trackId: 'a', soloed: true })
    expect(heard(engine)[0]).toBeCloseTo(0.15, 5)
    engine.apply({ type: 'track/setSolo', trackId: 'a', soloed: false })
    engine.apply({ type: 'track/setSolo', trackId: 'b', soloed: false })
    expect(heard(engine)[0]).toBeCloseTo(0.15, 5)
  })

  it('keeps the returns a soloed track feeds, so it still gets its reverb', () => {
    const engine = build([
      { id: 'a', fx: sendingTo('r'), volume: 0 },
      { id: 'b', volume: 0 },
      { id: 'r', kind: 'return', silent: true },
      { id: 'other', kind: 'return', silent: true },
    ])
    engine.apply({ type: 'track/setSolo', trackId: 'a', soloed: true })
    // a itself is at fader 0; the return it feeds is heard, the return nobody feeds adds nothing anyway.
    expect(heard(engine)[0]).toBeCloseTo(LEVEL, 5)
    engine.apply({ type: 'track/setSolo', trackId: 'a', soloed: false })
    engine.apply({ type: 'track/setSolo', trackId: 'b', soloed: true })
    expect(render(engine).left[4000]).toBe(0) // b feeds no return, and a's send is not heard
  })

  it('keeps returns fed through another return', () => {
    const engine = build([
      { id: 'a', fx: sendingTo('r1'), volume: 0 },
      { id: 'r1', kind: 'return', fx: noteGraphFrom([{ id: 'in', type: 'returnIn' }, { id: 'send', type: 'send', params: { amount: 1 }, trackId: 'r2' }, { id: 'out', type: 'trackOut' }], ['in.out>send.in']), silent: true },
      { id: 'r2', kind: 'return', silent: true },
    ])
    engine.apply({ type: 'track/setSolo', trackId: 'a', soloed: true })
    expect(heard(engine)[0]).toBeCloseTo(LEVEL, 5)
  })

  it('a soloed return is heard, and the tracks that feed it still send to it', () => {
    const engine = build([
      { id: 'a', fx: sendingTo('r'), volume: 1 },
      { id: 'r', kind: 'return', silent: true },
    ])
    engine.apply({ type: 'track/setSolo', trackId: 'r', soloed: true })
    expect(heard(engine)[0]).toBeCloseTo(LEVEL, 5) // only the wet signal; the dry track is soloed out
  })

  it('does not unmute a muted return that a soloed track feeds', () => {
    const engine = build([
      { id: 'a', fx: sendingTo('r'), volume: 0 },
      { id: 'r', kind: 'return', silent: true },
    ])
    engine.apply({ type: 'track/setMute', trackId: 'r', muted: true })
    engine.apply({ type: 'track/setSolo', trackId: 'a', soloed: true })
    expect(render(engine).left[4000]).toBe(0)
  })

  it('wins over mute on the same track', () => {
    const engine = build([{ id: 'a' }, { id: 'b' }])
    engine.apply({ type: 'track/setMute', trackId: 'a', muted: true })
    engine.apply({ type: 'track/setSolo', trackId: 'a', soloed: true })
    expect(heard(engine)[0]).toBeCloseTo(LEVEL, 5)
  })

  it('is worked out again when tracks come and go', () => {
    const engine = build([{ id: 'a' }, { id: 'b' }])
    engine.apply({ type: 'track/setSolo', trackId: 'a', soloed: true })
    engine.apply({ type: 'track/remove', trackId: 'a' })
    expect(heard(engine)[0]).toBeCloseTo(LEVEL, 5) // no solo left: b is heard again
  })

  it('applies from the start when a track is added with its settings', () => {
    const engine = build([{ id: 'a' }])
    engine.apply({ type: 'track/add', kind: 'audio', trackId: 'late', fx: createDefaultFxGraph(), clips: [clip()], volume: 1, muted: true, pan: -1, soloed: false })
    engine.apply({ type: 'clip/launch', trackId: 'late', clipId: 'clip' })
    expect(heard(engine)[0]).toBeCloseTo(LEVEL, 5)
  })
})

describe('master volume', () => {
  it('scales the whole mix exactly, before the soft clip', () => {
    const engine = build([{ id: 'a' }, { id: 'b' }])
    expect(heard(engine)[0]).toBeCloseTo(0.2, 5)
    engine.apply({ type: 'master/setVolume', volume: 0.5 })
    expect(heard(engine)[0]).toBeCloseTo(0.1, 5)
    expect(render(engine).left[4000]).toBeCloseTo(Math.tanh(0.1), 6)
  })

  it('at 0 silences everything, and at 1 restores it', () => {
    const engine = build([{ id: 'a' }])
    engine.apply({ type: 'master/setVolume', volume: 0 })
    const { left, right } = render(engine)
    expect(Math.max(...left.map(Math.abs), ...right.map(Math.abs))).toBe(0)
    engine.apply({ type: 'master/setVolume', volume: 1 })
    expect(heard(engine)[0]).toBeCloseTo(LEVEL, 5)
  })
})

describe('per-track peaks in the status', () => {
  it('report what each track adds to the output, after fader and pan, and reset when read', () => {
    const engine = build([{ id: 'a', volume: 0.5 }, { id: 'b', volume: 1 }, { id: 'quiet', silent: true }])
    render(engine)
    const first = engine.status().peaks
    expect(first.a).toBeCloseTo(0.05, 5)
    expect(first.b).toBeCloseTo(0.1, 5)
    expect(first.quiet).toBe(0)
    engine.apply({ type: 'track/setPan', trackId: 'b', pan: -1 })
    render(engine)
    expect(engine.status().peaks.b).toBeCloseTo(0.1 * Math.SQRT2, 5)
    // Read-and-reset: nothing rendered since the last status.
    expect(engine.status().peaks.a).toBe(0)
  })

  it('read zero for a track that is muted or soloed out, and still count the return it feeds', () => {
    const engine = build([{ id: 'a', fx: sendingTo('r'), volume: 0 }, { id: 'b' }, { id: 'r', kind: 'return', silent: true }])
    engine.apply({ type: 'track/setSolo', trackId: 'a', soloed: true })
    render(engine)
    const { peaks } = engine.status()
    expect(peaks.a).toBe(0) // fader at 0
    expect(peaks.b).toBe(0) // soloed out
    expect(peaks.r).toBeCloseTo(LEVEL, 5)
    engine.apply({ type: 'track/setMute', trackId: 'r', muted: true })
    render(engine)
    expect(engine.status().peaks.r).toBe(0)
  })

  it('includes every track, and drops the ones that were removed', () => {
    const engine = build([{ id: 'a' }, { id: 'b' }])
    expect(Object.keys(engine.status().peaks).sort()).toEqual(['a', 'b'])
    engine.apply({ type: 'track/remove', trackId: 'a' })
    expect(Object.keys(engine.status().peaks)).toEqual(['b'])
  })
})
