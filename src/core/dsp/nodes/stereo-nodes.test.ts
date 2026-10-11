import { describe, expect, it } from 'vitest'
import { SampleBank } from '../../sample'
import { MAX_BLOCK_FRAMES } from '../block'
import { requireNodeDefinition } from '../registry'
import { RIGHT, STEREO_FRAMES, leftOf, rightOf } from '../stereo'

const SAMPLE_RATE = 48000
const FRAMES = MAX_BLOCK_FRAMES

const context = (frames = FRAMES) => ({
  frames,
  sampleRate: SAMPLE_RATE,
  note: { frequency: 440, velocity: 1, gate: false, trigger: 0 },
  samples: new SampleBank(),
})

const sine = (frequency: number, length: number) =>
  Float32Array.from({ length }, (_, i) => Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE))

/** A stereo buffer holding `left` and `right` (each at most one block). */
const stereo = (left: ArrayLike<number>, right: ArrayLike<number>): Float32Array => {
  const buffer = new Float32Array(STEREO_FRAMES)
  buffer.set(left, 0)
  buffer.set(right, RIGHT)
  return buffer
}

/** Runs a node over `blocks` blocks of stereo (or mono) input and returns the left and right channels it produced. */
const runStereo = (type: string, input: Float32Array, blocks: number, params: Record<string, number> = {}) => {
  const definition = requireNodeDefinition(type)
  const node = definition.create(SAMPLE_RATE)
  for (const [id, value] of Object.entries(params)) node.setParam(id, value)
  const left = new Float32Array(blocks * FRAMES)
  const right = new Float32Array(blocks * FRAMES)
  const out = new Float32Array(STEREO_FRAMES)
  const mono = input.length === FRAMES * blocks
  for (let block = 0; block < blocks; block++) {
    const slice = mono
      ? input.subarray(block * FRAMES, (block + 1) * FRAMES)
      : stereo(leftOf(input), rightOf(input))
    node.process(context(), [slice], [out])
    left.set(leftOf(out), block * FRAMES)
    right.set(rightOf(out), block * FRAMES)
  }
  return { left, right }
}

const power = (buffer: Float32Array) => buffer.reduce((sum, v) => sum + v * v, 0)
const correlation = (a: Float32Array, b: Float32Array) => {
  let ab = 0
  for (let i = 0; i < a.length; i++) ab += a[i]! * b[i]!
  return ab / Math.sqrt(power(a) * power(b))
}

describe('pan', () => {
  const input = sine(440, FRAMES)
  const panned = (pan: number) => runStereo('pan', input, 1, { pan })

  it('keeps the total power the same wherever the sound is placed', () => {
    const centre = power(panned(0).left) + power(panned(0).right)
    for (const pan of [-1, -0.6, -0.2, 0.3, 0.8, 1]) {
      const { left, right } = panned(pan)
      expect(power(left) + power(right)).toBeCloseTo(centre, 3)
    }
  })

  it('puts a hard-left sound only in the left channel and a hard-right one only in the right', () => {
    expect(power(panned(-1).right)).toBeCloseTo(0, 10)
    expect(power(panned(-1).left)).toBeGreaterThan(1)
    expect(power(panned(1).left)).toBeCloseTo(0, 10)
  })

  it('is -3 dB in each channel at the centre, equal in both', () => {
    const { left, right } = panned(0)
    expect(left[10]! / input[10]!).toBeCloseTo(Math.SQRT1_2, 6)
    expect(left).toEqual(right)
  })
})

describe('width', () => {
  const wide = stereo(sine(300, FRAMES), sine(500, FRAMES))

  it('leaves the signal as it is at 1', () => {
    const { left, right } = runStereo('width', wide, 1, { width: 1 })
    for (let i = 0; i < FRAMES; i++) {
      expect(left[i]).toBeCloseTo(wide[i]!, 6)
      expect(right[i]).toBeCloseTo(wide[RIGHT + i]!, 6)
    }
  })

  it('makes the two channels identical at 0', () => {
    const { left, right } = runStereo('width', wide, 1, { width: 0 })
    expect(left).toEqual(right)
  })

  it('keeps the centre (what is the same in both channels) whatever the width', () => {
    const centred = stereo(sine(300, FRAMES), sine(300, FRAMES))
    for (const width of [0, 0.5, 2]) {
      const { left } = runStereo('width', centred, 1, { width })
      expect(left[40]).toBeCloseTo(centred[40]!, 6)
    }
  })
})

describe('mono sum', () => {
  it('averages the two channels', () => {
    const definition = requireNodeDefinition('monoSum')
    const out = new Float32Array(FRAMES)
    definition.create(SAMPLE_RATE).process(context(), [stereo([1, 0.5], [0, 0.5])], [out])
    expect(Array.from(out.slice(0, 2))).toEqual([0.5, 0.5])
  })
})

describe('stereo reverb', () => {
  const blocks = 200
  const mono = sine(440, FRAMES * blocks).map((v, i) => (i < 4 * FRAMES ? v : 0)) // a short burst, then the tail

  const tail = (() => {
    const definition = requireNodeDefinition('stereoReverb')
    const node = definition.create(SAMPLE_RATE)
    node.setParam('mix', 1)
    const left = new Float32Array(blocks * FRAMES)
    const right = new Float32Array(blocks * FRAMES)
    const buffer = new Float32Array(STEREO_FRAMES)
    for (let block = 0; block < blocks; block++) {
      const slice = mono.subarray(block * FRAMES, (block + 1) * FRAMES)
      node.process(context(), [stereo(slice, slice)], [buffer])
      left.set(leftOf(buffer), block * FRAMES)
      right.set(rightOf(buffer), block * FRAMES)
    }
    return { left, right }
  })()

  it('makes a tail from a mono source whose channels differ', () => {
    expect(power(tail.left)).toBeGreaterThan(0.01)
    expect(correlation(tail.left, tail.right)).toBeLessThan(0.9)
  })

  it('is still mono-compatible: the sum keeps most of the energy instead of cancelling', () => {
    const sum = tail.left.map((v, i) => v + tail.right[i]!)
    expect(power(sum)).toBeGreaterThan(0.5 * (power(tail.left) + power(tail.right)))
  })

  it('passes the input through untouched at mix 0', () => {
    const definition = requireNodeDefinition('stereoReverb')
    const node = definition.create(SAMPLE_RATE)
    node.setParam('mix', 0)
    const input = stereo(sine(300, FRAMES), sine(500, FRAMES))
    const buffer = new Float32Array(STEREO_FRAMES)
    node.process(context(), [input], [buffer])
    expect(buffer).toEqual(input)
  })
})

describe('ping-pong delay', () => {
  it('bounces the echoes between the channels', () => {
    const definition = requireNodeDefinition('pingPong')
    const node = definition.create(SAMPLE_RATE)
    node.setParam('time', 0.01) // 480 samples
    node.setParam('feedback', 0.8)
    node.setParam('mix', 1)
    const impulse = new Float32Array(STEREO_FRAMES)
    impulse[0] = 1
    impulse[RIGHT] = 1
    const left: number[] = []
    const right: number[] = []
    const out = new Float32Array(STEREO_FRAMES)
    for (let block = 0; block < 40; block++) {
      node.process(context(), [block === 0 ? impulse : new Float32Array(STEREO_FRAMES)], [out])
      left.push(...leftOf(out))
      right.push(...rightOf(out))
    }
    const at = (channel: number[], position: number) => channel[position]!
    expect(at(left, 480)).toBeCloseTo(1, 3) // first echo: left
    expect(at(right, 480)).toBeCloseTo(0, 3)
    expect(at(right, 960)).toBeCloseTo(0.8, 3) // second echo: right
    expect(at(left, 960)).toBeCloseTo(0, 3)
    expect(at(left, 1440)).toBeCloseTo(0.64, 3) // then left again, quieter
  })
})
