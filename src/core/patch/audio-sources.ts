import { TRACK_AUDIO_TYPE } from '../dsp'
import type { Patch } from './types'

/** Ids of the tracks a (flattened) insert graph takes audio from, with Track audio nodes. */
export const audioSources = (patch: Patch): string[] => [
  ...new Set(patch.nodes.flatMap((node) => (node.type === TRACK_AUDIO_TYPE && node.trackId ? [node.trackId] : []))),
]
