import { describe, expect, it } from 'vitest'
import { createDefaultPatch, createSamplerPatch } from '../patch'
import { createClip } from '../project'
import { Engine } from './engine'

const SAMPLE_RATE = 48000

const setup = () => {
  const engine = new Engine(SAMPLE_RATE)
  const clip = createClip('c', 4, [{ pitch: 69, start: 0, duration: 1, velocity: 1 }])
  engine.apply({ type: 'transport/setTempo', bpm: 120 })
  engine.apply({ type: 'track/add', trackId: 't', patch: createDefaultPatch(), clips: [clip], volume: 1, voices: 8 })
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
    expect(engine.status().tracks.t).toMatchObject({ playingClipId: null, queued: null })
  })
})

describe('Engine samples', () => {
  const SAMPLE = {
    id: 'a'.repeat(64),
    sampleRate: SAMPLE_RATE,
    data: Float32Array.from({ length: 24000 }, (_, i) => 0.8 * Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE)),
  }

  const samplerSetup = () => {
    const engine = new Engine(SAMPLE_RATE)
    const clip = createClip('hit', 4, [{ pitch: 60, start: 0, duration: 1, velocity: 1 }])
    engine.apply({ type: 'transport/setTempo', bpm: 120 })
    engine.apply({ type: 'track/add', trackId: 't', patch: createSamplerPatch(SAMPLE.id), clips: [clip], volume: 1, voices: 4 })
    return { engine, clip }
  }

  it('plays a sampler track once its sample data has arrived', () => {
    const { engine, clip } = samplerSetup()
    engine.apply({ type: 'sample/add', sample: SAMPLE })
    engine.apply({ type: 'clip/launch', trackId: 't', clipId: clip.id })

    expect(peak(render(engine, 12000).left)).toBeGreaterThan(0.2)
  })

  it('is silent while the sample is missing, then sounds when it is added', () => {
    const { engine, clip } = samplerSetup()
    engine.apply({ type: 'clip/launch', trackId: 't', clipId: clip.id })
    expect(peak(render(engine, 6000).left)).toBe(0)

    engine.apply({ type: 'sample/add', sample: SAMPLE })
    engine.apply({ type: 'transport/stop' })
    engine.apply({ type: 'clip/launch', trackId: 't', clipId: clip.id })
    expect(peak(render(engine, 6000).left)).toBeGreaterThan(0.2)
  })

  it('switches a sampler node to another sample without rebuilding', () => {
    const { engine, clip } = samplerSetup()
    const patch = createSamplerPatch(SAMPLE.id)
    const node = patch.nodes.find((n) => n.type === 'sampler')!
    engine.apply({ type: 'track/setPatch', trackId: 't', patch })
    engine.apply({ type: 'sample/add', sample: SAMPLE })
    engine.apply({ type: 'sample/add', sample: { ...SAMPLE, id: 'b'.repeat(64), data: new Float32Array(24000) } })
    engine.apply({ type: 'track/setSample', trackId: 't', nodeId: node.id, sampleId: 'b'.repeat(64) })
    engine.apply({ type: 'clip/launch', trackId: 't', clipId: clip.id })

    expect(peak(render(engine, 6000).left)).toBe(0) // the silent sample is now selected
  })

  it('previews a sample without any track and stops on request', () => {
    const engine = new Engine(SAMPLE_RATE)
    engine.apply({ type: 'sample/add', sample: SAMPLE })
    engine.apply({ type: 'sample/preview', sampleId: SAMPLE.id })
    expect(peak(render(engine, 4800).left)).toBeGreaterThan(0.2)

    engine.apply({ type: 'sample/stopPreview' })
    expect(peak(render(engine, 4800).left)).toBe(0)
  })

  it('reports the output peak since the last status, then resets it', () => {
    const engine = new Engine(SAMPLE_RATE)
    engine.apply({ type: 'sample/add', sample: SAMPLE })
    engine.apply({ type: 'sample/preview', sampleId: SAMPLE.id })
    render(engine, 4800)

    expect(engine.status().peak).toBeGreaterThan(0.2)
    expect(engine.status().peak).toBe(0)
  })

  it('ignores a preview of an unknown sample', () => {
    const engine = new Engine(SAMPLE_RATE)
    engine.apply({ type: 'sample/preview', sampleId: 'nope' })
    expect(peak(render(engine, 1000).left)).toBe(0)
  })
})
