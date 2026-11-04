import { describe, expect, it } from 'vitest'
import { type Patch, createDefaultFxGraph, noteGraphFrom, trackInIsStereo } from '../patch'
import { type AudioClip, NEW_AUDIO_TRACK_STEREO, addTrack, createAudioClip, createAudioTrack, createEmptyProject, setAudioClipAt } from '../project'
import type { SampleInfo } from '../sample'
import { parseProject, serializeProject } from '../persistence'
import { renderProject } from './bounce'
import { Engine } from './engine'

/** Audio tracks whose `Track in` runs in stereo (round 11a): each channel of a sample is heard on its side. */

const SAMPLE_RATE = 48000
const BEAT = 24000
const SAMPLE_ID = 'a'.repeat(64)

const clip = (overrides: Partial<AudioClip> = {}): AudioClip => ({
  id: 'clip', name: 'clip', sampleId: SAMPLE_ID, lengthBeats: 4, loop: true, warp: 'repitch',
  gain: 1, start: 0, end: 1, fadeIn: 0, fadeOut: 0, ...overrides,
})

const STEREO_FX = createDefaultFxGraph(true)
const MONO_FX = createDefaultFxGraph()

/** A track with `fx` playing `channels` (at `rate`) in `clipOf`, launched; plus any other tracks. */
const play = (channels: Float32Array[], fx: Patch, clipOf = clip(), rate = SAMPLE_RATE, others: Array<{ id: string; fx: Patch }> = []) => {
  const engine = new Engine(SAMPLE_RATE)
  engine.apply({ type: 'transport/setTempo', bpm: 120 })
  engine.apply({ type: 'sample/add', sample: { id: SAMPLE_ID, sampleRate: rate, channels } })
  engine.apply({ type: 'track/add', kind: 'audio', trackId: 'a', fx, clips: [clipOf], volume: 1 })
  for (const other of others) engine.apply({ type: 'track/add', kind: 'audio', trackId: other.id, fx: other.fx, clips: [null], volume: 1 })
  engine.apply({ type: 'clip/launch', trackId: 'a', clipId: clipOf.id })
  return engine
}

const render = (engine: Engine, frames: number) => {
  const left = new Float32Array(frames)
  const right = new Float32Array(frames)
  engine.render(left, right)
  return { left, right }
}

const same = (a: Float32Array, b: Float32Array) => a.length === b.length && a.every((value, i) => Object.is(value, b[i]))

const noise = (length: number, seed: number, level = 0.3) => {
  let state = seed
  return Float32Array.from({ length }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return level * (state / 2 ** 31 - 1)
  })
}

describe('a stereo audio track', () => {
  it('starts every new audio track, and says so where the runtime asks', () => {
    expect(NEW_AUDIO_TRACK_STEREO).toBe(true)
    expect(trackInIsStereo(createAudioTrack('Audio', 4).fx)).toBe(NEW_AUDIO_TRACK_STEREO)
    expect(trackInIsStereo(MONO_FX)).toBe(false)
  })

  it("keeps its Track in's stereo switch in a file", () => {
    const track = createAudioTrack('Audio', 4)
    const loaded = parseProject(serializeProject({ ...createEmptyProject(), tracks: [track] }))
    if (!loaded.ok) throw new Error(loaded.error)
    expect(trackInIsStereo(loaded.project.tracks[0]!.fx)).toBe(true)
  })

  it('plays each channel on its side; switched off, both sides play their average', () => {
    const channels = [new Float32Array(4 * BEAT).fill(0.2), new Float32Array(4 * BEAT).fill(-0.1)]
    const stereo = render(play(channels, STEREO_FX), 4800)
    expect(stereo.left[4000]).toBeCloseTo(Math.tanh(0.2), 6)
    expect(stereo.right[4000]).toBeCloseTo(Math.tanh(-0.1), 6)
    const mono = render(play(channels, MONO_FX), 4800)
    expect(mono.left[4000]).toBeCloseTo(Math.tanh(0.05), 6)
    expect(mono.right[4000]).toBeCloseTo(Math.tanh(0.05), 6)
  })

  it('plays a mono sample as the mono track does, bit for bit, in both channels', () => {
    const channels = [noise(4 * BEAT, 1)]
    const stereo = render(play(channels, STEREO_FX), 9600)
    const mono = render(play(channels, MONO_FX), 9600)
    expect(same(stereo.left, mono.left) && same(stereo.right, mono.right)).toBe(true)
  })

  it('reads both channels at the same position and level: loops, trims, fades, re-pitch and warp off', () => {
    const left = noise(44100, 2)
    const right = noise(44100, 3, 0.2)
    const settings: Array<Partial<AudioClip>> = [
      {},
      { start: 0.13, end: 0.71, fadeIn: 0.02, fadeOut: 0.05, gain: 0.6 },
      { lengthBeats: 1.5, start: 0.2, end: 0.9 },
      { warp: 'off', loop: true, start: 0.5, end: 0.8, fadeIn: 0.01, fadeOut: 0.01 },
      { warp: 'off', loop: false, gain: 0.8 },
    ]
    for (const overrides of settings) {
      const both = render(play([left, right], STEREO_FX, clip(overrides), 44100), 3 * BEAT)
      const onlyLeft = render(play([left], STEREO_FX, clip(overrides), 44100), 3 * BEAT)
      const onlyRight = render(play([right], STEREO_FX, clip(overrides), 44100), 3 * BEAT)
      expect(same(both.left, onlyLeft.left), JSON.stringify(overrides)).toBe(true)
      expect(same(both.right, onlyRight.right), JSON.stringify(overrides)).toBe(true)
    }
  })

  it("gives the track's tap one signal: the average of its channels", () => {
    const channels = [new Float32Array(4 * BEAT).fill(0.2), new Float32Array(4 * BEAT).fill(-0.1)]
    const takingFrom = noteGraphFrom(
      [{ id: 'in', type: 'trackIn' }, { id: 'ta', type: 'trackAudio', trackId: 'a', params: { tap: 0 } }, { id: 'out', type: 'trackOut' }],
      ['ta.out>out.in'],
    )
    const engine = play(channels, STEREO_FX, clip(), SAMPLE_RATE, [{ id: 'copy', fx: takingFrom }])
    engine.apply({ type: 'track/setVolume', trackId: 'a', volume: 0 })
    const { left, right } = render(engine, 4800)
    expect(left[4000]).toBeCloseTo(Math.tanh(0.05), 6)
    expect(right[4000]).toBeCloseTo(Math.tanh(0.05), 6)
  })

  it('switches path when its `Track in` is switched', () => {
    const channels = [new Float32Array(4 * BEAT).fill(0.2), new Float32Array(4 * BEAT).fill(0)]
    const engine = play(channels, MONO_FX)
    expect(render(engine, 4800).right[4000]).toBeCloseTo(Math.tanh(0.1), 6)
    engine.apply({ type: 'track/setFx', trackId: 'a', graph: STEREO_FX })
    expect(render(engine, 4800).right[4000]).toBeCloseTo(0, 6)
    engine.apply({ type: 'track/setFx', trackId: 'a', graph: MONO_FX })
    expect(render(engine, 4800).right[4000]).toBeCloseTo(Math.tanh(0.1), 6)
  })

  it('keeps its channels in the bounce', () => {
    const left = Float32Array.from({ length: SAMPLE_RATE }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE))
    const info: SampleInfo = { id: SAMPLE_ID, name: 'left only', extension: 'wav', durationSeconds: 1, sampleRate: SAMPLE_RATE, channels: 2, bytes: 0 }
    const track = createAudioTrack('Audio', 4)
    const project = setAudioClipAt(addTrack({ ...createEmptyProject(), tracks: [], samples: [info] }, track), track.id, 0, createAudioClip(info, 120))
    const result = renderProject(project, [{ id: SAMPLE_ID, sampleRate: SAMPLE_RATE, channels: [left, new Float32Array(SAMPLE_RATE)] }], {
      scope: { kind: 'scene', scene: 0 }, bars: 0.5, maxTail: 0,
    })
    const peak = (data: Float32Array) => data.reduce((max, value) => Math.max(max, Math.abs(value)), 0)
    expect(peak(result.left)).toBeGreaterThan(0.2)
    expect(peak(result.right)).toBe(0)
  })
})
