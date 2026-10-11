import { describe, expect, it } from 'vitest'
import type { SampleInfo } from '../sample'
import {
  type AudioClip,
  addAudioClip,
  addAudioTrackWithClip,
  addSamples,
  clampAudioClip,
  createAudioTrack,
  createDemoProject,
  guessLengthBeats,
  isAudioTrack,
  isTrimmed,
  playbackSpeed,
  regionFraction,
  removeSample,
  setClipAt,
  setClipNotes,
  setTrackVoices,
  tempoFromName,
  updateAudioClip,
  addTrack,
  createClip,
} from '.'

const sample = (overrides: Partial<SampleInfo> = {}): SampleInfo => ({
  id: 'a'.repeat(64),
  name: 'Loop',
  extension: 'wav',
  durationSeconds: 2,
  sampleRate: 44100,
  channels: 1,
  bytes: 1000,
  ...overrides,
})

const withAudioTrack = () => {
  const s = sample()
  const base = addSamples(createDemoProject(), [s])
  const project = addAudioTrackWithClip(base, s)
  const track = project.tracks[project.tracks.length - 1]!
  if (!isAudioTrack(track)) throw new Error('expected an audio track')
  return { project, track, clip: track.clips[0] as AudioClip, sample: s }
}

describe('tempoFromName', () => {
  it('reads a tempo out of a file name', () => {
    expect(tempoFromName('Funk Break 98 BPM')).toBe(98)
    expect(tempoFromName('loop_120bpm_Am')).toBe(120)
    expect(tempoFromName('Pad 87.5 bpm')).toBe(87.5)
  })

  it('ignores names without a plausible tempo', () => {
    expect(tempoFromName('Kick')).toBeNull()
    expect(tempoFromName('track 7 bpm')).toBeNull()
    expect(tempoFromName('9999 bpm')).toBeNull()
  })
})

describe('guessLengthBeats', () => {
  it('uses the project tempo, rounded to whole beats', () => {
    expect(guessLengthBeats(sample({ durationSeconds: 2 }), 120)).toBe(4)
    expect(guessLengthBeats(sample({ durationSeconds: 2 }), 110)).toBe(4) // 3.67 -> 4
    expect(guessLengthBeats(sample({ durationSeconds: 8 }), 120)).toBe(16)
  })

  it('prefers a tempo named in the file', () => {
    // 4 s at 90 bpm is exactly 6 beats; at the project's 120 it would have been 8.
    expect(guessLengthBeats(sample({ name: 'Groove 90 BPM', durationSeconds: 4 }), 120)).toBe(6)
  })

  it('never goes below one beat or above the limit', () => {
    expect(guessLengthBeats(sample({ durationSeconds: 0.05 }), 120)).toBe(1)
    expect(guessLengthBeats(sample({ durationSeconds: 100000 }), 120)).toBe(256)
  })
})

describe('playbackSpeed', () => {
  const clip = (overrides: Partial<AudioClip> = {}): AudioClip => ({
    id: 'c', name: 'c', sampleId: 's', lengthBeats: 4, loop: true, warp: 'repitch', gain: 1,
    start: 0, end: 1, fadeIn: 0, fadeOut: 0, ...overrides,
  })

  it('is 1 when the sample already fits its length at the tempo', () => {
    expect(playbackSpeed(clip(), 2, 120)).toBeCloseTo(1)
  })

  it('speeds up when the project is faster than the sample, slows down when slower', () => {
    expect(playbackSpeed(clip(), 2, 240)).toBeCloseTo(2)
    expect(playbackSpeed(clip(), 2, 60)).toBeCloseTo(0.5)
  })

  it('is always 1 with warp off', () => {
    expect(playbackSpeed(clip({ warp: 'off' }), 2, 240)).toBe(1)
  })
})

describe('audio tracks in the project', () => {
  it('addAudioTrackWithClip makes a looping, tempo-locked clip in the first scene', () => {
    const { track, clip, sample: s, project } = withAudioTrack()
    expect(track.name).toBe('Loop')
    expect(clip).toMatchObject({ sampleId: s.id, loop: true, warp: 'repitch', gain: 1, lengthBeats: 4 })
    expect(track.clips).toHaveLength(project.sceneCount)
    expect(track.clips.slice(1).every((slot) => slot === null)).toBe(true)
  })

  it('addAudioClip fills a slot', () => {
    const s = sample()
    let project = addSamples(createDemoProject(), [s])
    project = addTrack(project, createAudioTrack('Audio', project.sceneCount))
    const track = project.tracks[project.tracks.length - 1]!
    project = addAudioClip(project, track.id, 2, s)

    const updated = project.tracks[project.tracks.length - 1]!
    expect(isAudioTrack(updated) && updated.clips[2]?.sampleId).toBe(s.id)
  })

  it('updateAudioClip edits settings and keeps them in range', () => {
    const { project, track, clip } = withAudioTrack()
    const read = (p: typeof project) => {
      const t = p.tracks.find((candidate) => candidate.id === track.id)!
      return isAudioTrack(t) ? (t.clips[0] as AudioClip) : (undefined as never)
    }

    expect(read(updateAudioClip(project, track.id, clip.id, { gain: 0.5, loop: false })))
      .toMatchObject({ gain: 0.5, loop: false })
    expect(read(updateAudioClip(project, track.id, clip.id, { gain: 99, lengthBeats: 0 })))
      .toMatchObject({ gain: 2, lengthBeats: 1 })
  })

  it('updateAudioClip with nothing to change keeps the same project (no empty undo step)', () => {
    const { project, track, clip } = withAudioTrack()
    expect(updateAudioClip(project, track.id, clip.id, { gain: clip.gain })).toBe(project)
    expect(updateAudioClip(project, track.id, 'missing', { gain: 0.1 })).toBe(project)
  })

  it('removing a sample removes the audio clips that played it, and nothing else', () => {
    const { project, track, sample: s } = withAudioTrack()
    const removed = removeSample(project, s.id)
    const after = removed.tracks.find((t) => t.id === track.id)!

    expect(removed.samples.find((x) => x.id === s.id)).toBeUndefined()
    expect(isAudioTrack(after) && after.clips.every((slot) => slot === null)).toBe(true)
    expect(removed.tracks[0]).toBe(project.tracks[0]) // other tracks are shared, not copied
  })

  it('instrument-only edits leave an audio track alone', () => {
    const { project, track } = withAudioTrack()
    const midi = createClip('m', 4)

    expect(setClipAt(project, track.id, 0, midi)).toBe(project)
    expect(setClipNotes(project, track.id, 'x', [])).toBe(project)
    expect(setTrackVoices(project, track.id, 3)).toBe(project)
  })

  it('clampAudioClip repairs out-of-range and unknown values', () => {
    const { clip } = withAudioTrack()
    expect(clampAudioClip({ ...clip, gain: -5, lengthBeats: 5000, warp: 'nonsense' as never })).toMatchObject({
      gain: 0, lengthBeats: 256, warp: 'repitch',
    })
  })
})

describe('trim and fades', () => {
  const clip = (overrides: Partial<AudioClip> = {}): AudioClip => ({
    id: 'c', name: 'c', sampleId: 's', lengthBeats: 4, loop: true, warp: 'repitch', gain: 1,
    start: 0, end: 1, fadeIn: 0, fadeOut: 0, ...overrides,
  })

  it('new clips start untrimmed with a tiny declick fade', () => {
    const { clip: created } = withAudioTrack()
    expect(created).toMatchObject({ start: 0, end: 1, fadeIn: 0.002, fadeOut: 0.002 })
  })

  it('the length guess and the speed use only the trimmed part', () => {
    const s = sample({ durationSeconds: 4 })
    expect(guessLengthBeats(s, 120)).toBe(8)
    expect(guessLengthBeats(s, 120, 0.5)).toBe(4)
    // Half of a 4 s sample is 2 s: it already fits 4 beats at 120 bpm.
    expect(playbackSpeed(clip({ start: 0, end: 0.5 }), 4, 120)).toBeCloseTo(1)
    expect(regionFraction(clip({ start: 0.25, end: 0.75 }))).toBe(0.5)
  })

  it('keeps the region valid: start before end, inside the sample, never empty', () => {
    expect(clampAudioClip(clip({ start: -1, end: 5 }))).toMatchObject({ start: 0, end: 1 })
    const swapped = clampAudioClip(clip({ start: 0.8, end: 0.2 }))
    expect(swapped.start).toBe(0.8)
    expect(swapped.end).toBeGreaterThan(swapped.start)
    const empty = clampAudioClip(clip({ start: 1, end: 1 }))
    expect(empty.end).toBeGreaterThan(empty.start)
    expect(empty.end).toBeLessThanOrEqual(1)
  })

  it('limits fades to a sane range', () => {
    expect(clampAudioClip(clip({ fadeIn: -1, fadeOut: 99 }))).toMatchObject({ fadeIn: 0, fadeOut: 2 })
  })

  it('knows whether a clip is trimmed', () => {
    expect(isTrimmed(clip())).toBe(false)
    expect(isTrimmed(clip({ start: 0.1 }))).toBe(true)
    expect(isTrimmed(clip({ end: 0.9 }))).toBe(true)
  })

  it('updateAudioClip applies and clamps trim changes', () => {
    const { project, track, clip: created } = withAudioTrack()
    const edited = updateAudioClip(project, track.id, created.id, { start: 0.3, end: 0.2 })
    const t = edited.tracks.find((x) => x.id === track.id)!
    const result = (isAudioTrack(t) ? t.clips[0] : null) as AudioClip
    expect(result.start).toBe(0.3)
    expect(result.end).toBeGreaterThan(0.3)
  })
})
