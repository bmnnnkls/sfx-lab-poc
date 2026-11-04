import type { SampleInfo } from './types'

/** How many markers and regions a sample keeps, and how long their names are. */
export const SAMPLE_MARK_LIMITS = { markers: 256, regions: 256, name: 60 } as const

/** The id of the first version of a sample: its `origin`, or its own id for a sample no edit made. */
export const originOf = (info: SampleInfo): string => info.origin ?? info.id

/**
 * The key a sample's bytes are stored under, in storage, project packages and library bundles: its id, the hash of
 * those bytes. Everything that turns a `SampleInfo` into bytes asks this, so a later scheme (a stable id with a content
 * hash beside it) changes here and in `replaceSample`.
 */
export const bytesKeyOf = (info: Pick<SampleInfo, 'id'>): string => info.id

/** How many frames the sample has, from what is saved about it (markers and regions must lie inside). */
export const savedFrameCount = (info: Pick<SampleInfo, 'durationSeconds' | 'sampleRate'>): number =>
  Math.round(info.durationSeconds * info.sampleRate)
