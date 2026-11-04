import { describe, expect, it } from 'vitest'
import { Engine } from './engine'
import { SamplePreview } from './sample-preview'

const play = (channels: Float32Array[], frames = 4) => {
  const preview = new SamplePreview(48000, 1)
  preview.start({ id: 'a', sampleRate: 48000, channels })
  const left = new Float32Array(frames)
  const right = new Float32Array(frames)
  preview.mixInto(left, right)
  return { left: Array.from(left), right: Array.from(right) }
}

const ramp = Float32Array.from({ length: 10 }, (_, i) => i / 10)

describe('SamplePreview', () => {
  it('plays each channel of a stereo sample to its side, and a mono one to both', () => {
    expect(play([Float32Array.of(0.5, 0.25, 0, 0), Float32Array.of(0, -0.5, 0, 0)])).toEqual({ left: [0.5, 0.25, 0, 0], right: [0, -0.5, 0, 0] })
    expect(play([Float32Array.of(0.5, 0.25)])).toEqual({ left: [0.5, 0.25, 0, 0], right: [0.5, 0.25, 0, 0] })
  })

  it('plays a range once, then stops', () => {
    const preview = new SamplePreview(48000, 1)
    preview.start({ id: 'a', sampleRate: 48000, channels: [ramp] }, { from: 3, to: 6 })
    const left = new Float32Array(6)
    preview.mixInto(left, new Float32Array(6))
    expect(Array.from(left, (value) => +value.toFixed(5))).toEqual([0.3, 0.4, 0.5, 0, 0, 0])
    expect(preview.position()).toBeNull()
  })

  it('loops a range, from its first frame again', () => {
    const preview = new SamplePreview(48000, 1)
    preview.start({ id: 'a', sampleRate: 48000, channels: [ramp] }, { from: 3, to: 6, loop: true })
    const left = new Float32Array(8)
    preview.mixInto(left, new Float32Array(8))
    expect(Array.from(left, (value) => +value.toFixed(5))).toEqual([0.3, 0.4, 0.5, 0.3, 0.4, 0.5, 0.3, 0.4])
    expect(preview.position()).toEqual({ sampleId: 'a', frame: 5 })
  })

  it('reports the frame it has reached, at the sample rate of the sample', () => {
    const preview = new SamplePreview(48000, 1)
    preview.start({ id: 'a', sampleRate: 24000, channels: [new Float32Array(1000)] }, { from: 100 })
    expect(preview.position()).toEqual({ sampleId: 'a', frame: 100 })
    preview.mixInto(new Float32Array(64), new Float32Array(64))
    expect(preview.position()).toEqual({ sampleId: 'a', frame: 132 })
    preview.stop()
    expect(preview.position()).toBeNull()
  })

  it('plays nothing for an empty range', () => {
    const preview = new SamplePreview(48000, 1)
    preview.start({ id: 'a', sampleRate: 48000, channels: [ramp] }, { from: 6, to: 6 })
    expect(preview.position()).toBeNull()
  })
})

describe('the preview in the engine', () => {
  it('reports its sample and frame in the status while it plays, and nothing otherwise', () => {
    const engine = new Engine(48000)
    engine.apply({ type: 'sample/add', sample: { id: 'a', sampleRate: 48000, channels: [new Float32Array(48000).fill(0.1)] } })
    expect(engine.status()).not.toHaveProperty('preview')
    engine.apply({ type: 'sample/preview', sampleId: 'a', from: 1000, to: 2000, loop: true })
    engine.render(new Float32Array(1280), new Float32Array(1280))
    expect(engine.status().preview).toEqual({ sampleId: 'a', frame: 1280 % 1000 + 1000 })
    engine.apply({ type: 'sample/stopPreview' })
    expect(engine.status()).not.toHaveProperty('preview')
  })
})
