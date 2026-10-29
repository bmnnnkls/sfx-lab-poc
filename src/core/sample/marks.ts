import type { SampleInfo } from './types'

/** How many markers and regions a sample keeps, and how long their names are. */
export const SAMPLE_MARK_LIMITS = { markers: 256, regions: 256, name: 60 } as const

/** The id of the first version of a sample: its `origin`, or its own id for a sample no edit made. */
export const originOf = (info: SampleInfo): string => info.origin ?? info.id

/** How many frames the sample has, from what is saved about it (markers and regions must lie inside). */
export const savedFrameCount = (info: Pick<SampleInfo, 'durationSeconds' | 'sampleRate'>): number =>
  Math.round(info.durationSeconds * info.sampleRate)
