import { SEND_TYPE } from '../dsp'
import type { Patch } from './types'

/** Ids of the return tracks a (flattened) insert graph sends to. */
export const sendTargets = (patch: Patch): string[] => [
  ...new Set(patch.nodes.flatMap((node) => (node.type === SEND_TYPE && node.trackId ? [node.trackId] : []))),
]
