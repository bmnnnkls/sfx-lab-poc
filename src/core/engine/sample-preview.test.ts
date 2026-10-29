import { describe, expect, it } from 'vitest'
import { SamplePreview } from './sample-preview'

const play = (channels: Float32Array[], frames = 4) => {
  const preview = new SamplePreview(48000, 1)
  preview.start({ id: 'a', sampleRate: 48000, channels })
  const left = new Float32Array(frames)
  const right = new Float32Array(frames)
  preview.mixInto(left, right)
  return { left: Array.from(left), right: Array.from(right) }
}

describe('SamplePreview', () => {
  it('plays each channel of a stereo sample to its side, and a mono one to both', () => {
    expect(play([Float32Array.of(0.5, 0.25, 0, 0), Float32Array.of(0, -0.5, 0, 0)])).toEqual({ left: [0.5, 0.25, 0, 0], right: [0, -0.5, 0, 0] })
    expect(play([Float32Array.of(0.5, 0.25)])).toEqual({ left: [0.5, 0.25, 0, 0], right: [0.5, 0.25, 0, 0] })
  })
})
