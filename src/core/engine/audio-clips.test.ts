import { describe, expect, it } from 'vitest'
import { createClip, createNote, type AudioClip } from '../project'
import { createDefaultPatch } from '../patch'
import { Engine } from './engine'

const SAMPLE_RATE = 48000
const BEAT = 24000 // frames per beat at 120 bpm
const TAIL = 240 // the 5 ms fade-out when a clip stops or is replaced
const AMPLITUDE = 0.2 // small enough that the master soft clip is close to linear

const SAMPLE_ID = 'a'.repeat(64)

const ramp = (length: number) => Float32Array.from({ length }, (_, i) => (AMPLITUDE * i) / length)
const dc = (length: number) => new Float32Array(length).fill(AMPLITUDE)

const audioClip = (overrides: Partial<AudioClip> = {}): AudioClip => ({
  id: 'clip',
  name: 'clip',
  sampleId: SAMPLE_ID,
  lengthBeats: 4,
  loop: true,
  warp: 'repitch',
  gain: 1,
  start: 0,
  end: 1,
  fadeIn: 0, // exact sample values in these tests; fades and trim have their own
  fadeOut: 0,
  ...overrides,
})

/** 4 beats of audio at 120 bpm = 96000 frames = 2 s, so in re-pitch mode it plays at exactly 1x. */
const setup = (data: Float32Array = ramp(4 * BEAT), clip: AudioClip = audioClip(), volume = 1, sampleRate = SAMPLE_RATE) => {
  const engine = new Engine(SAMPLE_RATE)
  engine.apply({ type: 'transport/setTempo', bpm: 120 })
  engine.apply({ type: 'sample/add', sample: { id: SAMPLE_ID, sampleRate, data } })
  engine.apply({ type: 'track/add', kind: 'audio', trackId: 'a', clips: [clip], volume })
  return { engine, clip }
}

const render = (engine: Engine, frames: number): Float32Array => {
  const left = new Float32Array(frames)
  engine.render(left, new Float32Array(frames))
  return left
}

/** What the master bus does to a value (soft clip). */
const out = (value: number) => Math.tanh(value)

describe('audio clips in the engine', () => {
  it('are silent until launched', () => {
    const { engine } = setup()
    expect(Math.max(...render(engine, 4800))).toBe(0)
    expect(engine.status().tracks.a).toMatchObject({ playingClipId: null })
  })

  it('start on the downbeat when launched at the start, reading the sample from its first frame', () => {
    const { engine, clip } = setup()
    engine.apply({ type: 'clip/launch', trackId: 'a', clipId: clip.id })
    const left = render(engine, 2000)

    expect(left[0]).toBeCloseTo(0, 6)
    expect(left[1000]).toBeCloseTo(out((AMPLITUDE * 1000) / (4 * BEAT)), 6)
    expect(engine.status().tracks.a).toMatchObject({ playingClipId: 'clip', startBeat: 0 })
  })

  it('wait for the next bar and start on exactly that sample', () => {
    const { engine, clip } = setup(dc(4 * BEAT))
    engine.apply({ type: 'transport/play' })
    render(engine, BEAT) // one beat in: the next bar line is at beat 4 = frame 96000
    engine.apply({ type: 'clip/launch', trackId: 'a', clipId: clip.id })
    expect(engine.status().tracks.a).toMatchObject({ playingClipId: null, queued: 'clip' })

    const left = render(engine, 4 * BEAT)
    const firstSound = left.findIndex((v) => v !== 0)
    // We already rendered 1 beat; the bar line is 3 beats further on.
    expect(firstSound).toBe(3 * BEAT)
    expect(engine.status().tracks.a).toMatchObject({ playingClipId: 'clip', startBeat: 4, queued: null })
  })

  it('loop seamlessly, repeating exactly every clip length', () => {
    const { engine, clip } = setup()
    engine.apply({ type: 'clip/launch', trackId: 'a', clipId: clip.id })
    const left = render(engine, 8 * BEAT)

    for (const frame of [0, 1234, 50000, 95999]) {
      expect(left[frame + 4 * BEAT]).toBeCloseTo(left[frame]!, 6)
    }
  })

  it('stay locked to the grid through a tempo change (position follows the beat clock, no drift)', () => {
    const { engine, clip } = setup()
    engine.apply({ type: 'clip/launch', trackId: 'a', clipId: clip.id })

    for (const bpm of [120, 77, 200, 90, 240]) {
      engine.apply({ type: 'transport/setTempo', bpm })
      const left = render(engine, 12345)
      // Where we are on the beat clock now tells us exactly what the last sample must be.
      const { beat } = engine.status()
      const beatsPerSample = bpm / 60 / SAMPLE_RATE
      const phase = (((beat - beatsPerSample) % 4) + 4) % 4 / 4
      expect(left[left.length - 1], `at ${bpm} bpm`).toBeCloseTo(out(AMPLITUDE * phase), 4)
    }
  })

  it('speed up and slow down with the tempo in re-pitch mode (the loop still takes the same number of beats)', () => {
    const fast = setup()
    fast.engine.apply({ type: 'transport/setTempo', bpm: 240 })
    fast.engine.apply({ type: 'clip/launch', trackId: 'a', clipId: 'clip' })
    const left = render(fast.engine, 3 * BEAT) // 4 beats at 240 bpm = 48000 frames = one full pass, then a bit more

    // The ramp has gone around once and just wrapped back to the start.
    expect(left[1]).toBeLessThan(left[47999]!)
    expect(left[48001]).toBeLessThan(left[47999]! / 2)
  })

  it('a non-looping clip plays once and then stops showing as playing', () => {
    const { engine, clip } = setup(dc(4 * BEAT), audioClip({ loop: false }))
    engine.apply({ type: 'clip/launch', trackId: 'a', clipId: clip.id })
    const left = render(engine, 6 * BEAT)

    expect(left[4 * BEAT - 10]).toBeGreaterThan(0)
    expect(Math.max(...left.subarray(4 * BEAT + 100))).toBe(0)
    expect(engine.status().tracks.a).toMatchObject({ playingClipId: null })
  })

  it('with warp off, play at original speed whatever the tempo', () => {
    // 0.5 s of ramp: native speed means the pass takes 24000 frames at every tempo.
    for (const bpm of [60, 120, 190]) {
      const { engine, clip } = setup(ramp(24000), audioClip({ warp: 'off' }))
      engine.apply({ type: 'transport/setTempo', bpm })
      engine.apply({ type: 'clip/launch', trackId: 'a', clipId: clip.id })
      const left = render(engine, 30000)

      expect(left[23999], `${bpm} bpm`).toBeCloseTo(out(AMPLITUDE * (23999 / 24000)), 4)
      expect(left[24000 + 10], `${bpm} bpm wraps`).toBeLessThan(0.001)
    }
  })

  it('with warp off, compensate for a sample recorded at a different rate', () => {
    // 24 kHz material plays at half speed on a 48 kHz engine.
    const { engine, clip } = setup(ramp(12000), audioClip({ warp: 'off' }), 1, 24000)
    engine.apply({ type: 'clip/launch', trackId: 'a', clipId: clip.id })
    const left = render(engine, 30000)

    // Half speed: frame 23900 is at source position 11950 (frame 23999 is the loop seam, which interpolates back to 0).
    expect(left[23900]).toBeCloseTo(out(AMPLITUDE * (11950 / 12000)), 3)
    expect(left[24010]).toBeLessThan(0.001)
  })

  it('scale with the clip gain and the track volume', () => {
    const level = (gain: number, volume: number) => {
      const { engine, clip } = setup(dc(4 * BEAT), audioClip({ gain }), volume)
      engine.apply({ type: 'clip/launch', trackId: 'a', clipId: clip.id })
      return render(engine, 1000)[500]!
    }
    const base = level(1, 1)
    expect(level(0.5, 1)).toBeCloseTo(base / 2, 2)
    expect(level(1, 0.5)).toBeCloseTo(base / 2, 2)
    expect(level(0, 1)).toBe(0)
  })

  it('are silent while their sample is missing, then join in phase when it arrives', () => {
    const engine = new Engine(SAMPLE_RATE)
    engine.apply({ type: 'transport/setTempo', bpm: 120 })
    engine.apply({ type: 'track/add', kind: 'audio', trackId: 'a', clips: [audioClip()], volume: 1 })
    engine.apply({ type: 'clip/launch', trackId: 'a', clipId: 'clip' })
    expect(Math.max(...render(engine, BEAT))).toBe(0)

    engine.apply({ type: 'sample/add', sample: { id: SAMPLE_ID, sampleRate: SAMPLE_RATE, data: ramp(4 * BEAT) } })
    const left = render(engine, 100)
    // One beat has passed, so we are a quarter of the way through the loop.
    expect(left[0]).toBeCloseTo(out(AMPLITUDE * 0.25), 3)
  })

  it('pick up edits made while playing, and stop if the clip is deleted', () => {
    const { engine, clip } = setup(dc(4 * BEAT))
    engine.apply({ type: 'clip/launch', trackId: 'a', clipId: clip.id })
    const loud = render(engine, 500)[499]!

    engine.apply({ type: 'track/setAudioClips', trackId: 'a', clips: [{ ...clip, gain: 0.5 }] })
    expect(render(engine, 500)[499]).toBeCloseTo(loud / 2, 2)

    engine.apply({ type: 'track/setAudioClips', trackId: 'a', clips: [null] })
    render(engine, TAIL * 2)
    expect(Math.max(...render(engine, 500))).toBe(0)
    expect(engine.status().tracks.a).toMatchObject({ playingClipId: null })
  })

  it('stop at the next bar when the track is stopped, and immediately when the transport stops', () => {
    const { engine, clip } = setup(dc(4 * BEAT))
    engine.apply({ type: 'clip/launch', trackId: 'a', clipId: clip.id })
    render(engine, BEAT)
    engine.apply({ type: 'track/stop', trackId: 'a' })
    expect(engine.status().tracks.a).toMatchObject({ queued: 'stop' })
    const left = render(engine, 4 * BEAT)
    expect(left[3 * BEAT - 10]).toBeGreaterThan(0) // still sounding until the bar line…
    expect(left[3 * BEAT + TAIL * 2]).toBe(0) // …then faded out

    engine.apply({ type: 'clip/launch', trackId: 'a', clipId: clip.id })
    render(engine, 100)
    engine.apply({ type: 'transport/stop' })
    render(engine, TAIL * 2) // the short fade-out
    expect(Math.max(...render(engine, 100))).toBe(0)
    expect(engine.status().tracks.a).toMatchObject({ playingClipId: null, queued: null })
  })

  it('an empty scene slot stops an audio track', () => {
    const { engine, clip } = setup(dc(4 * BEAT))
    engine.apply({ type: 'track/setAudioClips', trackId: 'a', clips: [clip, null] })
    engine.apply({ type: 'scene/launch', scene: 0 })
    render(engine, 100)
    expect(engine.status().tracks.a?.playingClipId).toBe('clip')

    engine.apply({ type: 'scene/launch', scene: 1 })
    expect(engine.status().tracks.a?.queued).toBe('stop')
  })

  it('mix with instrument tracks, each launched independently', () => {
    const { engine, clip } = setup(dc(4 * BEAT))
    const midi = createClip('m', 4, [createNote(69, 0, 2)])
    engine.apply({ type: 'track/add', kind: 'instrument', trackId: 'i', patch: createDefaultPatch(), clips: [midi], volume: 1, voices: 4 })
    engine.apply({ type: 'clip/launch', trackId: 'a', clipId: clip.id })
    const audioOnly = Math.max(...render(engine, 4800))
    engine.apply({ type: 'transport/stop' })

    engine.apply({ type: 'clip/launch', trackId: 'a', clipId: clip.id })
    engine.apply({ type: 'clip/launch', trackId: 'i', clipId: midi.id })
    const both = render(engine, 4800)
    expect(Math.max(...both)).toBeGreaterThan(audioOnly)
    expect(engine.status().tracks.i?.playingClipId).toBe(midi.id)
    expect(engine.status().tracks.a?.playingClipId).toBe('clip')
  })

  it('render the same whatever the output is chunked into', () => {
    const run = (chunk: number) => {
      const { engine, clip } = setup()
      engine.apply({ type: 'clip/launch', trackId: 'a', clipId: clip.id })
      const result = new Float32Array(48000)
      for (let offset = 0; offset < result.length; offset += chunk) result.set(render(engine, chunk), offset)
      return result
    }
    expect(run(128)).toEqual(run(4000))
  })
})

describe('audio clip trim, fades and declicking', () => {
  it('only plays the trimmed region, stretched over the clip length (re-pitch)', () => {
    // Region 25%..75% of the ramp, spread over 4 beats: the pass starts at 0.25 and heads for 0.75.
    const { engine, clip } = setup(ramp(8 * BEAT), audioClip({ start: 0.25, end: 0.75 }))
    engine.apply({ type: 'clip/launch', trackId: 'a', clipId: clip.id })
    const left = render(engine, 4 * BEAT + 100)

    expect(left[0]).toBeCloseTo(out(AMPLITUDE * 0.25), 3)
    expect(left[2 * BEAT]).toBeCloseTo(out(AMPLITUDE * 0.5), 3) // halfway through the pass
    expect(left[4 * BEAT - 5]).toBeCloseTo(out(AMPLITUDE * 0.75), 3)
    expect(left[4 * BEAT + 5]).toBeCloseTo(out(AMPLITUDE * 0.25), 3) // the loop restarts at the region start
  })

  it('loops just the trimmed region at original speed with warp off', () => {
    const { engine, clip } = setup(ramp(24000), audioClip({ warp: 'off', start: 0.25, end: 0.75 }))
    engine.apply({ type: 'clip/launch', trackId: 'a', clipId: clip.id })
    const left = render(engine, 30000) // region is 12000 frames long

    expect(left[0]).toBeCloseTo(out(AMPLITUDE * 0.25), 3)
    expect(left[11990]).toBeCloseTo(out(AMPLITUDE * 0.7498), 3)
    expect(left[12010]).toBeCloseTo(out(AMPLITUDE * 0.25), 2) // wrapped back to the start of the region, not the file
  })

  it('a non-looping trimmed clip stops at the end of its region', () => {
    const { engine, clip } = setup(dc(4 * BEAT), audioClip({ warp: 'off', loop: false, start: 0, end: 0.5 }))
    engine.apply({ type: 'clip/launch', trackId: 'a', clipId: clip.id })
    const left = render(engine, 4 * BEAT)

    expect(left[2 * BEAT - 10]).toBeGreaterThan(0)
    expect(Math.max(...left.subarray(2 * BEAT + 10))).toBe(0)
  })

  it('fades in and out at the ends of each pass', () => {
    // 0.01 s fades on a 48 kHz sample = 480 frames.
    const { engine, clip } = setup(dc(4 * BEAT), audioClip({ fadeIn: 0.01, fadeOut: 0.01 }))
    engine.apply({ type: 'clip/launch', trackId: 'a', clipId: clip.id })
    const left = render(engine, 4 * BEAT + 600)

    expect(left[0]).toBe(0)
    expect(left[240]).toBeCloseTo(out(AMPLITUDE * 0.5), 3) // halfway up the fade-in
    expect(left[480 + 10]).toBeCloseTo(out(AMPLITUDE), 3)
    expect(left[4 * BEAT - 240]).toBeCloseTo(out(AMPLITUDE * 0.5), 2) // halfway down the fade-out
    expect(left[4 * BEAT - 1]).toBeLessThan(out(AMPLITUDE) * 0.01)
    expect(left[4 * BEAT + 5]).toBeLessThan(out(AMPLITUDE) * 0.05) // the next pass fades in again
  })

  it('last the same amount of sample time at any tempo (twice as fast = half as many frames)', () => {
    const rampLength = (bpm: number) => {
      const { engine, clip } = setup(dc(4 * BEAT), audioClip({ fadeIn: 0.01 }))
      engine.apply({ type: 'transport/setTempo', bpm })
      engine.apply({ type: 'clip/launch', trackId: 'a', clipId: clip.id })
      const left = render(engine, 2000)
      return left.findIndex((v) => v >= out(AMPLITUDE) * 0.999)
    }
    const normal = rampLength(120)
    const doubled = rampLength(240)
    expect(normal).toBeGreaterThan(440)
    expect(doubled).toBeCloseTo(normal / 2, -1)
  })

  it('cap each fade at half the region, so they never overlap', () => {
    const { engine, clip } = setup(dc(4 * BEAT), audioClip({ warp: 'off', loop: false, end: 0.01, fadeIn: 2, fadeOut: 2 }))
    engine.apply({ type: 'clip/launch', trackId: 'a', clipId: clip.id })
    const left = render(engine, 1500) // region is 960 frames: up for 480, down for 480

    const peakFrame = left.indexOf(Math.max(...left))
    expect(peakFrame).toBeGreaterThan(440)
    expect(peakFrame).toBeLessThan(520)
  })

  it('stopping at the bar fades out over about 5 ms instead of cutting off', () => {
    const { engine, clip } = setup(dc(4 * BEAT))
    engine.apply({ type: 'clip/launch', trackId: 'a', clipId: clip.id })
    render(engine, BEAT)
    engine.apply({ type: 'track/stop', trackId: 'a' })
    const left = render(engine, 4 * BEAT)
    const stopAt = 3 * BEAT

    expect(left[stopAt - 1]).toBeCloseTo(out(AMPLITUDE), 3)
    const tail = Array.from(left.subarray(stopAt, stopAt + TAIL + 20))
    expect(tail[0]).toBeGreaterThan(0) // not an abrupt cut
    expect(tail[TAIL + 5]).toBe(0)
    // Smooth: no sample-to-sample jump anywhere near the size of the signal itself.
    for (let i = 1; i < tail.length; i++) expect(Math.abs(tail[i]! - tail[i - 1]!)).toBeLessThan(out(AMPLITUDE) / 100)
    // And it only ever goes down.
    for (let i = 1; i < TAIL; i++) expect(tail[i]!).toBeLessThanOrEqual(tail[i - 1]! + 1e-9)
  })

  it('replacing a clip crossfades the old one out under the new one', () => {
    const { engine, clip } = setup(dc(4 * BEAT))
    engine.apply({ type: 'track/setAudioClips', trackId: 'a', clips: [clip, { ...clip, id: 'second', gain: 0.5 }] })
    engine.apply({ type: 'clip/launch', trackId: 'a', clipId: 'clip' })
    render(engine, BEAT)
    engine.apply({ type: 'clip/launch', trackId: 'a', clipId: 'second' })
    const left = render(engine, 4 * BEAT)
    const swap = 3 * BEAT

    // At the swap both are briefly audible (old fading out, new at half level), then only the new one.
    expect(left[swap]).toBeGreaterThan(left[swap + TAIL + 50]!)
    expect(left[swap + TAIL + 50]).toBeCloseTo(out(AMPLITUDE * 0.5), 3)
  })
})
