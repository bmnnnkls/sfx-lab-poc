import type { ParamSpec } from '../types'
import { tempoOf } from '../types'

/** How a delay reads its Time: `off` in seconds, `beat` in beats of the project's tempo (0.75 is a dotted eighth). */
export const TIME_SYNCS = ['off', 'beat'] as const

export const timeSyncParam: ParamSpec = { id: 'sync', label: 'Sync', min: 0, max: TIME_SYNCS.length - 1, default: 0, step: 1, options: TIME_SYNCS }

/**
 * A Time parameter in seconds: as it is, or (Sync on `beat`) as beats of the tempo the block is played at, so the echo keeps
 * its place in the bar when the tempo changes. Never longer than `max` seconds, the length of the delay line.
 */
export const syncedSeconds = (time: number, sync: number, context: { readonly tempo?: number }, max: number): number =>
  Math.min(max, Math.round(sync) === 1 ? (time * 60) / tempoOf(context) : time)
