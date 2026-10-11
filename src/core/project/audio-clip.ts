import type { SampleInfo } from '../sample'
import { clamp, createId } from '../shared'
import { MAX_CLIP_BEATS, MIN_CLIP_BEATS } from './limits'
import type { AudioClip, WarpMode } from './types'

export const MIN_GAIN = 0
export const MAX_GAIN = 2
export const WARP_MODES: readonly WarpMode[] = ['repitch', 'off']

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
export const guessLengthBeats = (sample: SampleInfo, projectTempo: number): number => {
  const bpm = tempoFromName(sample.name) ?? projectTempo
  return clamp(Math.round((sample.durationSeconds * bpm) / 60), MIN_CLIP_BEATS, MAX_CLIP_BEATS)
}

export const createAudioClip = (sample: SampleInfo, projectTempo: number): AudioClip => ({
  id: createId('audio'),
  name: sample.name,
  sampleId: sample.id,
  lengthBeats: guessLengthBeats(sample, projectTempo),
  loop: true,
  warp: 'repitch',
  gain: 1,
})

/** Brings user-edited fields back into their valid ranges. */
export const clampAudioClip = (clip: AudioClip): AudioClip => ({
  ...clip,
  lengthBeats: clamp(clip.lengthBeats, MIN_CLIP_BEATS, MAX_CLIP_BEATS),
  gain: clamp(clip.gain, MIN_GAIN, MAX_GAIN),
  warp: WARP_MODES.includes(clip.warp) ? clip.warp : 'repitch',
})

/**
 * How fast the sample plays relative to its original speed at `tempo` (1 = unchanged). In `repitch` mode this
 * is what pulls the loop onto the grid; pitch changes by the same factor.
 */
export const playbackSpeed = (clip: AudioClip, durationSeconds: number, tempo: number): number => {
  if (clip.warp === 'off') return 1
  const secondsForOnePass = (clip.lengthBeats * 60) / tempo
  return durationSeconds / secondsForOnePass
}
