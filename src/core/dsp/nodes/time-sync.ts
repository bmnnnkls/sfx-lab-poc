import type { ParamSpec } from '../types'

/** How a delay reads its Time: `off` in seconds, `beat` in beats of the project's tempo (0.75 is a dotted eighth). */
export const TIME_SYNCS = ['off', 'beat'] as const

export const timeSyncParam: ParamSpec = { id: 'sync', label: 'Sync', min: 0, max: TIME_SYNCS.length - 1, default: 0, step: 1, options: TIME_SYNCS }
