import { describe, expect, it } from 'vitest'
import { type Patch, createSamplerPatch, noteGraphFrom } from '../patch'
import {
  type Project,
  addTrack,
  createAudioClip,
  createAudioTrack,
  createClip,
  createEmptyProject,
  createNote,
  createReturnTrack,
  createTrack,
  setAudioClipAt,
  setClipAt,
  setMasterVolume,
  setTempo,
  setTrackPan,
  usedSampleIds,
} from '../project'
import type { SampleData, SampleInfo } from '../sample'
import {
  BOUNCE_CHUNK_FRAMES,
  Bounce,
  defaultBounceBars,
  encodeBounce,
  renderProject,
  resolveBounceOptions,
} from './bounce'

const RATE = 48000

/** A sine through an envelope and a gain: a note sounds at `gain` and fades over `release` seconds after it ends. */
const tonePatch = (release = 0.05, gain = 0.5): Patch =>
  noteGraphFrom(
    [
      { id: 'note', type: 'note' },
      { id: 'osc', type: 'oscillator', params: { waveform: 0 } },
      { id: 'env', type: 'envelope', params: { attack: 0.001, decay: 0.01, sustain: 1, release } },
      { id: 'amp', type: 'gain', params: { gain } },
      { id: 'out', type: 'output' },
    ],
    ['note.frequency>osc.freq', 'note.gate>env.gate', 'osc.out>amp.in', 'env.out>amp.cv', 'amp.out>out.in'],
  )

const blank = (): Project => ({ ...createEmptyProject(), tracks: [] })

/** A project with one track playing `notes` in a clip of `beats` in scene 0; returns the ids too. */
const withTone = (notes = [createNote(69, 0, 2, 1)], beats = 4, patch = tonePatch()) => {
  const clip = createClip('clip', beats, notes)
  const track = createTrack('Tone', 4, patch)
  const project = setClipAt(addTrack(blank(), track), track.id, 0, clip)
  return { project, trackId: track.id, clipId: clip.id }
}

/** Same samples, compared in a loop: `toEqual` on arrays this long takes seconds. */
const identical = (a: ArrayLike<number>, b: ArrayLike<number>) => a.length === b.length && Array.prototype.every.call(a, (value: number, i: number) => value === b[i])
const peakOf = (data: Float32Array) => data.reduce((max, value) => Math.max(max, Math.abs(value)), 0)
/** Rising zero crossings per second of the stretch from `from` to `to` (frames). */
const frequencyOf = (data: Float32Array, from: number, to: number) => {
  let rises = 0
  for (let i = from + 1; i < to; i++) if (data[i - 1]! < 0 && data[i]! >= 0) rises++
  return (rises * RATE) / (to - from)
}

describe('renderProject', () => {
  it('plays the clip for its bars, at the pitch of the note and the level of the patch', () => {
    const { project, trackId, clipId } = withTone()
    const { left, right, sampleRate } = renderProject(project, [], { scope: { kind: 'clip', trackId, clipId }, maxTail: 0 })
    expect(sampleRate).toBe(RATE)
    expect(left).toHaveLength(2 * RATE) // one 4-beat bar at 120 BPM
    expect(right).toHaveLength(left.length)
    expect(frequencyOf(left, 4800, RATE)).toBeCloseTo(440, -1) // within a few Hz; A4 is note 69
    // sine 1 x gain 0.5 x the track's fader 0.8 = 0.4, which the output soft clip (tanh) brings to 0.38
    expect(peakOf(left)).toBeGreaterThan(0.35)
    expect(peakOf(left)).toBeLessThan(0.4)
    // The note is 2 beats long: it is over, and nothing is left but silence, in the second half of the bar.
    expect(peakOf(left.subarray(RATE + 4800))).toBeLessThan(1e-3)
  })

  it('a note in the middle of the clip starts there, to the sample', () => {
    const { project, trackId, clipId } = withTone([createNote(69, 2, 1, 1)])
    const { left } = renderProject(project, [], { scope: { kind: 'clip', trackId, clipId }, maxTail: 0 })
    const first = left.findIndex((value) => Math.abs(value) > 1e-4)
    expect(first).toBeGreaterThanOrEqual(RATE) // beat 2 at 120 BPM
    expect(first).toBeLessThan(RATE + 128)
  })

  it('loops the clip for as many bars as asked', () => {
    const { project, trackId, clipId } = withTone([createNote(69, 0, 1, 1)])
    const { left } = renderProject(project, [], { scope: { kind: 'clip', trackId, clipId }, bars: 3, maxTail: 0 })
    expect(left).toHaveLength(6 * RATE)
    for (const bar of [0, 1, 2]) expect(peakOf(left.subarray(bar * 2 * RATE + 4800, bar * 2 * RATE + 9600)), `bar ${bar}`).toBeGreaterThan(0.3)
    // Not two notes in the first bar: the note of bar 2 does not start early or late.
    expect(peakOf(left.subarray(2 * RATE - 2000, 2 * RATE - 400))).toBeLessThan(0.05)
  })

  it('applies the project tempo: a 2-beat clip is 1 second at 120 BPM and 2 at 60', () => {
    const { project, trackId, clipId } = withTone([createNote(69, 0, 1, 1)], 2)
    const scope = { kind: 'clip', trackId, clipId } as const
    expect(defaultBounceBars(project, scope)).toBe(0.5)
    expect(renderProject(project, [], { scope, maxTail: 0 }).left).toHaveLength(RATE)
    expect(renderProject(setTempo(project, 60), [], { scope, maxTail: 0 }).left).toHaveLength(2 * RATE)
    expect(renderProject(setTempo(project, 90), [], { scope, maxTail: 0 }).left).toHaveLength(Math.round(RATE * (2 * 60) / 90))
    // The note itself is a beat long: 0.5 s at 120 BPM, and its pitch does not change.
    const at120 = renderProject(project, [], { scope, maxTail: 0 }).left
    expect(peakOf(at120.subarray(Math.round(RATE * 0.6)))).toBeLessThan(1e-3)
    expect(peakOf(at120.subarray(Math.round(RATE * 0.3), Math.round(RATE * 0.4)))).toBeGreaterThan(0.3)
  })

  it('is stereo for real: a track panned hard left leaves the right channel silent', () => {
    const { project, trackId, clipId } = withTone()
    const scope = { kind: 'clip', trackId, clipId } as const
    const left = renderProject(setTrackPan(project, trackId, -1), [], { scope, maxTail: 0 })
    expect(peakOf(left.left)).toBeGreaterThan(0.3)
    expect(peakOf(left.right)).toBeLessThan(1e-6)
    const right = renderProject(setTrackPan(project, trackId, 1), [], { scope, maxTail: 0 })
    expect(peakOf(right.right)).toBeGreaterThan(0.3)
    expect(peakOf(right.left)).toBeLessThan(1e-6)
    const centre = renderProject(project, [], { scope, maxTail: 0 })
    expect(identical(centre.left, centre.right)).toBe(true)
  })

  it('a scene plays the clip of every track in that row, and a clip only its own track', () => {
    const clipA = createClip('a', 4, [createNote(69, 0, 3, 1)])
    const clipB = createClip('b', 4, [createNote(57, 0, 3, 1)])
    const trackA = createTrack('A', 4, tonePatch())
    const trackB = createTrack('B', 4, tonePatch())
    let project = addTrack(addTrack(blank(), trackA), trackB)
    project = setTrackPan(setTrackPan(setClipAt(setClipAt(project, trackA.id, 1, clipA), trackB.id, 1, clipB), trackA.id, -1), trackB.id, 1)

    const scene = renderProject(project, [], { scope: { kind: 'scene', scene: 1 }, maxTail: 0 })
    expect(peakOf(scene.left)).toBeGreaterThan(0.3)
    expect(peakOf(scene.right)).toBeGreaterThan(0.3)
    expect(frequencyOf(scene.left, 4800, RATE)).toBeCloseTo(440, -1)
    expect(frequencyOf(scene.right, 4800, RATE)).toBeCloseTo(220, -1)

    const clip = renderProject(project, [], { scope: { kind: 'clip', trackId: trackA.id, clipId: clipA.id }, maxTail: 0 })
    expect(peakOf(clip.left)).toBeGreaterThan(0.3)
    expect(peakOf(clip.right)).toBeLessThan(1e-6)
    // An empty scene is a bar of silence.
    expect(peakOf(renderProject(project, [], { scope: { kind: 'scene', scene: 0 }, maxTail: 0 }).left)).toBe(0)
  })

  it('the scene is as long as its longest clip', () => {
    const short = createClip('s', 4, [createNote(60, 0, 1, 1)])
    const long = createClip('l', 8, [createNote(60, 0, 1, 1)])
    const [a, b] = [createTrack('A', 4, tonePatch()), createTrack('B', 4, tonePatch())]
    const project = setClipAt(setClipAt(addTrack(addTrack(blank(), a), b), a.id, 0, short), b.id, 0, long)
    expect(defaultBounceBars(project, { kind: 'scene', scene: 0 })).toBe(2)
    expect(defaultBounceBars(project, { kind: 'scene', scene: 3 })).toBe(1)
  })

  it('renders a sampler of a known buffer, and an audio clip, from the samples it is given', () => {
    const data = Float32Array.from({ length: RATE }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 330 * i) / RATE))
    const sample: SampleData = { id: 'a'.repeat(64), sampleRate: RATE, data }
    const info: SampleInfo = { id: sample.id, name: 'tone', extension: 'wav', durationSeconds: 1, sampleRate: RATE, channels: 1, bytes: 0 }

    const clip = createClip('hit', 4, [createNote(60, 0, 1, 1)])
    const sampler = createTrack('Sampler', 4, createSamplerPatch(sample.id))
    let project = setClipAt(addTrack({ ...blank(), samples: [info] }, sampler), sampler.id, 0, clip)
    expect(usedSampleIds(project)).toEqual([sample.id])
    const played = renderProject(project, [sample], { scope: { kind: 'clip', trackId: sampler.id, clipId: clip.id }, maxTail: 0 })
    expect(frequencyOf(played.left, 2400, 24000)).toBeCloseTo(330, -1)
    expect(peakOf(played.left)).toBeGreaterThan(0.25)
    // Without the audio, the same project is silent, not an error.
    expect(peakOf(renderProject(project, [], { scope: { kind: 'clip', trackId: sampler.id, clipId: clip.id }, maxTail: 0 }).left)).toBe(0)

    const audio = createAudioTrack('Loop', 4)
    const audioClip = { ...createAudioClip(info, 120), lengthBeats: 2, loop: false, warp: 'off' as const }
    project = setAudioClipAt(addTrack(project, audio), audio.id, 0, audioClip)
    const looped = renderProject(project, [sample], { scope: { kind: 'clip', trackId: audio.id, clipId: audioClip.id }, maxTail: 0 })
    expect(looped.left).toHaveLength(RATE)
    expect(frequencyOf(looped.left, 2400, 24000)).toBeCloseTo(330, -1)
  })

  it('44.1 kHz is a render at 44.1 kHz: same length in seconds, same pitch', () => {
    const { project, trackId, clipId } = withTone()
    const { left, sampleRate } = renderProject(project, [], { scope: { kind: 'clip', trackId, clipId }, sampleRate: 44100, maxTail: 0 })
    expect(sampleRate).toBe(44100)
    expect(left).toHaveLength(88200)
    const rises = left.reduce((n, value, i) => (i > 0 && left[i - 1]! < 0 && value >= 0 ? n + 1 : n), 0)
    expect(rises).toBeGreaterThan(435) // 440 Hz for the 1 s the note lasts (and its 50 ms release): 440 to 462 cycles
    expect(rises).toBeLessThan(470)
  })

  it('does not depend on the master being untouched: the master volume is part of the sound', () => {
    const { project, trackId, clipId } = withTone()
    const scope = { kind: 'clip', trackId, clipId } as const
    const full = peakOf(renderProject(project, [], { scope, maxTail: 0 }).left)
    const half = peakOf(renderProject(setMasterVolume(project, 0.5), [], { scope, maxTail: 0 }).left)
    expect(half / full).toBeGreaterThan(0.45)
    expect(half / full).toBeLessThan(0.55)
  })

  it('refuses a scope that is not in the project', () => {
    const { project } = withTone()
    expect(() => renderProject(project, [], { scope: { kind: 'scene', scene: 9 } })).toThrow(/scene/)
    expect(() => renderProject(project, [], { scope: { kind: 'clip', trackId: 'nope', clipId: 'nope' } })).toThrow(/clip/)
  })
})

describe('the end of the last bar', () => {
  it('starts nothing after it: the loop point is not a note on the last sample', () => {
    // A 0.1 s block of constant level, played as a one-shot: a stray note at the loop point would leave 0.1 s of it in the tail.
    const hit: SampleData = { id: 'b'.repeat(64), sampleRate: RATE, data: new Float32Array(RATE / 10).fill(0.5) }
    const clip = createClip('hit', 4, [createNote(60, 0, 1, 1)])
    const track = createTrack('Hit', 4, createSamplerPatch(hit.id))
    for (const tempo of [120, 97, 133, 61, 45]) {
      const project = setClipAt(addTrack({ ...blank(), tempo }, track), track.id, 0, clip)
      for (const bars of [1, 2, 3]) {
        const result = renderProject(project, [hit], { scope: { kind: 'clip', trackId: track.id, clipId: clip.id }, bars, maxTail: 1 })
        expect(result.left.length, `${tempo} BPM, ${bars} bars`).toBe(result.bodyFrames)
        expect(peakOf(result.left.subarray(result.bodyFrames - 2)), `${tempo} BPM, ${bars} bars`).toBe(0)
      }
    }
  })
})

describe('the tail', () => {
  it('rings on after the last bar until the output is quiet, and stops there', () => {
    const { project, trackId, clipId } = withTone([createNote(69, 0, 4, 1)], 4, tonePatch(0.4))
    const scope = { kind: 'clip', trackId, clipId } as const
    const none = renderProject(project, [], { scope, maxTail: 0 })
    const tailed = renderProject(project, [], { scope })
    expect(none.left).toHaveLength(2 * RATE)
    expect(tailed.bodyFrames).toBe(2 * RATE)
    // The release is 0.4 s: -80 dB is reached within a bit more than that, and the file ends there, not 10 s later.
    expect(tailed.left.length).toBeGreaterThan(2 * RATE + 0.1 * RATE)
    expect(tailed.left.length).toBeLessThan(2 * RATE + 1.5 * RATE)
    // The body is the same with or without a tail, and the tail is the note dying away.
    expect(identical(tailed.left.subarray(0, 2 * RATE - 600), none.left.subarray(0, 2 * RATE - 600))).toBe(true)
    expect(peakOf(tailed.left.subarray(2 * RATE + 100))).toBeGreaterThan(1e-4)
    expect(Math.abs(tailed.left[tailed.left.length - 1]!)).toBeLessThan(2e-4)
  })

  it('is cut at maxTail when the sound has not died by then', () => {
    const { project, trackId, clipId } = withTone([createNote(69, 0, 4, 1)], 4, tonePatch(30))
    const scope = { kind: 'clip', trackId, clipId } as const
    expect(renderProject(project, [], { scope, maxTail: 1 }).left).toHaveLength(3 * RATE)
    expect(renderProject(project, [], { scope, maxTail: 2.5 }).left).toHaveLength(Math.round(4.5 * RATE))
  })

  it('a reverb on the track is not cut', () => {
    const { project, trackId, clipId } = withTone([createNote(69, 0, 1, 1)])
    const verb = noteGraphFrom(
      [{ id: 'in', type: 'trackIn' }, { id: 'verb', type: 'stereoReverb', params: { mix: 0.5, size: 0.9 } }, { id: 'out', type: 'trackOut' }],
      ['in.out>verb.in', 'verb.out>out.in'],
    )
    const wet = { ...project, tracks: project.tracks.map((track) => ({ ...track, fx: verb })) }
    const scope = { kind: 'clip', trackId, clipId } as const
    const dry = renderProject(project, [], { scope })
    const rung = renderProject(wet, [], { scope })
    expect(rung.left.length).toBeGreaterThan(dry.left.length + RATE)
  })

  it('a silent project is just its bars of silence', () => {
    const clip = createClip('empty', 4)
    const track = createTrack('T', 4, tonePatch())
    const project = setClipAt(addTrack(blank(), track), track.id, 0, clip)
    const result = renderProject(project, [], { scope: { kind: 'clip', trackId: track.id, clipId: clip.id } })
    expect(result.left).toHaveLength(2 * RATE)
    expect(peakOf(result.left)).toBe(0)
  })

  it('a sound that never stops runs the tail to maxTail', () => {
    const noise = noteGraphFrom([{ id: 'note', type: 'note' }, { id: 'n', type: 'noise', params: { level: 0.5 } }, { id: 'out', type: 'output' }], ['n.out>out.in'])
    const { project, trackId, clipId } = withTone([createNote(60, 0, 1, 1)], 4, noise)
    const result = renderProject(project, [], { scope: { kind: 'clip', trackId, clipId }, maxTail: 1 })
    expect(result.left).toHaveLength(3 * RATE)
  })
})

describe('normalize', () => {
  it('brings the peak to -1 dBFS, up or down, and keeps the balance between the channels', () => {
    const { project, trackId, clipId } = withTone()
    const scope = { kind: 'clip', trackId, clipId } as const
    const quiet = setTrackPan(project, trackId, -0.5)
    const plain = renderProject(quiet, [], { scope, maxTail: 0 })
    const normal = renderProject(quiet, [], { scope, maxTail: 0, normalize: true })
    expect(Math.max(peakOf(normal.left), peakOf(normal.right))).toBeCloseTo(10 ** (-1 / 20), 5)
    const gain = peakOf(normal.left) / peakOf(plain.left)
    expect(peakOf(normal.right) / peakOf(plain.right)).toBeCloseTo(gain, 4)

    // A loud patch is brought down, too.
    const loud = withTone([createNote(69, 0, 2, 1)], 4, tonePatch(0.05, 4))
    const hot = renderProject(loud.project, [], { scope: { kind: 'clip', trackId: loud.trackId, clipId: loud.clipId }, maxTail: 0, normalize: true })
    expect(peakOf(hot.left)).toBeCloseTo(10 ** (-1 / 20), 5)
  })

  it('leaves silence silent', () => {
    const clip = createClip('empty', 4)
    const track = createTrack('T', 4, tonePatch())
    const project = setClipAt(addTrack(blank(), track), track.id, 0, clip)
    const result = renderProject(project, [], { scope: { kind: 'clip', trackId: track.id, clipId: clip.id }, normalize: true })
    expect(peakOf(result.left)).toBe(0)
    expect(peakOf(result.right)).toBe(0)
    expect(result.left.every(Number.isFinite)).toBe(true)
  })
})

describe('determinism', () => {
  it('two renders of the same project are identical, down to the bytes of the file', () => {
    // Chance everywhere it can be: noise in a chord, a random LFO, a reverb.
    const patch = noteGraphFrom(
      [
        { id: 'note', type: 'note' },
        { id: 'n', type: 'noise', params: { level: 0.3 } },
        { id: 'lfo', type: 'lfo', params: { shape: 4, rate: 7 } },
        { id: 'amp', type: 'gain', params: { gain: 0.5 } },
        { id: 'env', type: 'envelope', params: { release: 0.3 } },
        { id: 'out', type: 'output' },
      ],
      ['n.out>amp.in', 'lfo.uni>amp.cv', 'note.gate>env.gate', 'amp.out>out.in'],
    )
    const clip = createClip('chord', 4, [createNote(60, 0, 2, 1), createNote(64, 0, 2, 1), createNote(67, 0.5, 2, 1)])
    const track = createTrack('Chord', 4, patch)
    const project = setClipAt(addTrack(blank(), track), track.id, 0, clip)
    const options = { scope: { kind: 'clip', trackId: track.id, clipId: clip.id } } as const

    const [first, second] = [renderProject(project, [], options), renderProject(project, [], options)]
    expect(peakOf(first.left)).toBeGreaterThan(0.05)
    expect(identical(first.left, second.left)).toBe(true)
    expect(identical(first.right, second.right)).toBe(true)
    expect(identical(encodeBounce(first), encodeBounce(second))).toBe(true)
    // And stepping in chunks of any size from outside comes to the same thing as running it in one go.
    const bounce = new Bounce(project, [], options)
    let steps = 0
    while (!bounce.done) {
      bounce.step()
      steps++
    }
    expect(steps).toBeGreaterThan(2 * RATE / BOUNCE_CHUNK_FRAMES)
    expect(identical(bounce.result().left, first.left)).toBe(true)
  })

  it('the voices of a chord are different noise, so the chord is not just louder', () => {
    const noise = noteGraphFrom([{ id: 'note', type: 'note' }, { id: 'n', type: 'noise', params: { level: 0.2 } }, { id: 'out', type: 'output' }], ['n.out>out.in'])
    const rms = (notes: number[]) => {
      const clip = createClip('c', 4, notes.map((pitch) => createNote(pitch, 0, 1, 1)))
      const track = createTrack('T', 4, noise)
      const project = setClipAt(addTrack(blank(), track), track.id, 0, clip)
      const { left } = renderProject(project, [], { scope: { kind: 'clip', trackId: track.id, clipId: clip.id }, maxTail: 0 })
      const body = left.subarray(2400, 24000)
      return Math.sqrt(body.reduce((sum, v) => sum + v * v, 0) / body.length)
    }
    const ratio = rms([60, 64]) / rms([60])
    expect(ratio).toBeGreaterThan(1.3)
    expect(ratio).toBeLessThan(1.5) // sqrt(2) = 1.41 for two noises that do not agree; 2 when they did
  })
})

describe('options', () => {
  it('fills in the defaults and keeps numbers in range', () => {
    const { project, trackId, clipId } = withTone()
    const scope = { kind: 'clip', trackId, clipId } as const
    expect(resolveBounceOptions(project, { scope })).toEqual({ scope, sampleRate: 48000, bars: 1, maxTail: 10, normalize: false, bitDepth: 16 })
    const wild = resolveBounceOptions(project, { scope, bars: 1e9, maxTail: -5, sampleRate: 12345 as 44100, bitDepth: 24 as 16 })
    expect(wild).toMatchObject({ bars: 64, maxTail: 0, sampleRate: 48000, bitDepth: 16 })
    expect(resolveBounceOptions(project, { scope, bars: Number.NaN, maxTail: Number.NaN }).bars).toBe(1)
    expect(resolveBounceOptions(project, { scope, bars: 0 }).bars).toBe(0.25)
    expect(resolveBounceOptions(project, { scope, bitDepth: 32, sampleRate: 44100, normalize: true })).toMatchObject({ bitDepth: 32, sampleRate: 44100, normalize: true })
  })

  it('a bounce reports its progress and refuses to be read before it is done', () => {
    const { project, trackId, clipId } = withTone()
    const bounce = new Bounce(project, [], { scope: { kind: 'clip', trackId, clipId }, maxTail: 1 })
    expect(bounce.progress).toBe(0)
    expect(() => bounce.result()).toThrow(/not finished/)
    bounce.step()
    expect(bounce.progress).toBeGreaterThan(0)
    expect(bounce.progress).toBeLessThan(0.1)
    while (!bounce.done) bounce.step()
    expect(bounce.progress).toBe(1)
    bounce.step() // harmless
    expect(bounce.result().left.length).toBeGreaterThanOrEqual(2 * RATE)
  })

  it('a return track and the sends to it are part of the render', () => {
    const { project, trackId, clipId } = withTone()
    const send = createReturnTrack('Verb')
    const sent = { ...addTrack(project, send), tracks: [...addTrack(project, send).tracks.map((track) => (track.id === trackId && track.kind === 'instrument' ? { ...track, sends: { [send.id]: 1 } } : track))] }
    const scope = { kind: 'clip', trackId, clipId } as const
    const dry = renderProject(project, [], { scope, maxTail: 0 })
    const withReturn = renderProject(sent, [], { scope, maxTail: 0 })
    expect(peakOf(withReturn.left)).toBeGreaterThan(peakOf(dry.left) * 1.3) // the send adds the same signal again
  })
})
