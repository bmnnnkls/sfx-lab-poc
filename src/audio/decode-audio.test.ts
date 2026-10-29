import { describe, expect, it } from 'vitest'
import { keepChannels } from './decode-audio'

describe('keepChannels', () => {
  it('keeps one or two channels as copies, and averages more into one', () => {
    const left = Float32Array.of(1, 0.5)
    const right = Float32Array.of(0, -0.5)
    const [only] = keepChannels([left])
    expect(only).toEqual(left)
    expect(only).not.toBe(left)
    expect(keepChannels([left, right])).toEqual([left, right])
    expect(keepChannels([left, right, Float32Array.of(0.5, 0)])).toEqual([Float32Array.of(0.5, 0)])
  })
})
