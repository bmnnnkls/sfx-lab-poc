import { describe, expect, it } from 'vitest'
import { createDefaultPatch } from '../patch'
import { createClip } from '../project'
import { Engine } from './engine'

const SAMPLE_RATE = 48000

const setup = () => {
  const engine = new Engine(SAMPLE_RATE)
  const clip = createClip('c', 4, [{ pitch: 69, start: 0, duration: 1, velocity: 1 }])
  engine.apply({ type: 'transport/setTempo', bpm: 120 })
  engine.apply({ type: 'track/add', trackId: 't', patch: createDefaultPatch(), clips: [clip], volume: 1 })
  return { engine, clip }
}

const render = (engine: Engine, frames: number) => {
  const left = new Float32Array(frames)
  const right = new Float32Array(frames)
  engine.render(left, right)
  return { left, right }
}

const peak = (buffer: Float32Array) => buffer.reduce((max, value) => Math.max(max, Math.abs(value)), 0)

describe('Engine', () => {
  it('is silent and stopped until something is launched', () => {
    const { engine } = setup()
    const { left } = render(engine, 4800)

    expect(peak(left)).toBe(0)
    expect(engine.status().playing).toBe(false)
  })

  it('launching a clip starts the transport and produces audio', () => {
    const { engine, clip } = setup()
    engine.apply({ type: 'clip/launch', trackId: 't', clipId: clip.id })
    const { left, right } = render(engine, 24000)

    expect(engine.status().playing).toBe(true)
    expect(peak(left)).toBeGreaterThan(0.01)
    expect(left).toEqual(right)
    expect(left.every(Number.isFinite)).toBe(true)
  })

  it('starts the note on the exact sample of its beat', () => {
    const { engine } = setup()
    const second = createClip('later', 4, [{ pitch: 69, start: 1, duration: 1, velocity: 1 }])
    engine.apply({ type: 'track/setClips', trackId: 't', clips: [second] })
    engine.apply({ type: 'clip/launch', trackId: 't', clipId: second.id })

    // 120 bpm at 48 kHz: one beat is 24000 samples.
    const { left } = render(engine, 30000)
    const firstSound = left.findIndex((value) => Math.abs(value) > 1e-6)

    expect(firstSound).toBeGreaterThanOrEqual(24000)
    expect(firstSound).toBeLessThan(24000 + 64)
  })

  it('renders identically regardless of how the output is chunked', () => {
    const run = (chunk: number) => {
      const { engine, clip } = setup()
      engine.apply({ type: 'clip/launch', trackId: 't', clipId: clip.id })
      const out = new Float32Array(48000)
      for (let offset = 0; offset < out.length; offset += chunk) {
        out.set(render(engine, chunk).left, offset)
      }
      return out
    }

    expect(run(128)).toEqual(run(4000))
  })

  it('stopping rewinds, silences and clears launch state', () => {
    const { engine, clip } = setup()
    engine.apply({ type: 'clip/launch', trackId: 't', clipId: clip.id })
    render(engine, 24000)
    engine.apply({ type: 'transport/stop' })

    // The envelope releases and the delay tail (feedback 0.4) decays away.
    render(engine, 240000)
    expect(peak(render(engine, 4800).left)).toBeLessThan(1e-3)
    expect(engine.status()).toMatchObject({ playing: false, beat: 0 })
    expect(engine.status().tracks.t).toEqual({ playingClipId: null, queued: null })
  })
})
