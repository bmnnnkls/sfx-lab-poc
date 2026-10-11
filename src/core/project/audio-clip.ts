import type { SampleInfo } from '../sample'
import { clamp, createId } from '../shared'
import { MAX_CLIP_BEATS, MIN_CLIP_BEATS } from './limits'
import type { AudioClip, WarpMode } from './types'

export const MIN_GAIN = 0
export const MAX_GAIN = 2
export const WARP_MODES: readonly WarpMode[] = ['repitch', 'off']

/** The played region can't shrink below this fraction of the sample. */
export const MIN_REGION = 0.002
export const MAX_FADE_SECONDS = 2
/** New clips get a few milliseconds of fade so launching, looping and stopping never click. */
export const DEFAULT_FADE_SECONDS = 0.002

/** Loop packs often put their tempo in the file name ("Funk Break 98 BPM.wav"). */
export const tempoFromName = (name: string): number | null => {
  const match = /(\d{2,3}(?:\.\d+)?)\s*bpm/i.exec(name)
  const bpm = match ? Number(match[1]) : NaN
  return bpm >= 40 && bpm <= 300 ? bpm : null
}

/**
 * Best guess at how many beats a sample spans: at the tempo in its name if it has one, otherwise at the
 * project tempo. Always editable afterwards.
 */
export const guessLengthBeats = (sample: SampleInfo, projectTempo: number, regionFraction = 1): number => {
  const bpm = tempoFromName(sample.name) ?? projectTempo
  const seconds = sample.durationSeconds * regionFraction
  return clamp(Math.round((seconds * bpm) / 60), MIN_CLIP_BEATS, MAX_CLIP_BEATS)
}

export const createAudioClip = (sample: SampleInfo, projectTempo: number): AudioClip => ({
  id: createId('audio'),
  name: sample.name,
  sampleId: sample.id,
  lengthBeats: guessLengthBeats(sample, projectTempo),
  loop: true,
  warp: 'repitch',
  gain: 1,
  start: 0,
  end: 1,
  fadeIn: DEFAULT_FADE_SECONDS,
  fadeOut: DEFAULT_FADE_SECONDS,
})

/** Brings user-edited fields back into their valid ranges (and the trim region into a valid shape). */
export const clampAudioClip = (clip: AudioClip): AudioClip => {
  const start = clamp(clip.start, 0, 1 - MIN_REGION)
  return {
    ...clip,
    lengthBeats: clamp(clip.lengthBeats, MIN_CLIP_BEATS, MAX_CLIP_BEATS),
    gain: clamp(clip.gain, MIN_GAIN, MAX_GAIN),
    warp: WARP_MODES.includes(clip.warp) ? clip.warp : 'repitch',
    start,
    end: clamp(clip.end, start + MIN_REGION, 1),
    fadeIn: clamp(clip.fadeIn, 0, MAX_FADE_SECONDS),
    fadeOut: clamp(clip.fadeOut, 0, MAX_FADE_SECONDS),
  }
}

/** The fraction of the sample that plays. */
export const regionFraction = (clip: AudioClip): number => clip.end - clip.start

export const isTrimmed = (clip: AudioClip): boolean => clip.start > 0 || clip.end < 1

/**
 * How fast the sample plays relative to its original speed at `tempo` (1 = unchanged). In `repitch` mode this
 * is what pulls the loop onto the grid; pitch changes by the same factor.
 */
export const playbackSpeed = (clip: AudioClip, durationSeconds: number, tempo: number): number => {
  if (clip.warp === 'off') return 1
  const secondsForOnePass = (clip.lengthBeats * 60) / tempo
  return (durationSeconds * regionFraction(clip)) / secondsForOnePass
}
