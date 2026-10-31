import { originOf, savedFrameCount } from './marks'
import { type RemapStep, type SampleRemap, inverseStep, remapOfSteps } from './remap'
import type { SampleInfo, SampleLineage } from './types'

/**
 * A sample's lineage: what *Revert to original* needs. Each in-place edit appends its position map (`RemapStep`); the
 * first one also records the original's facts, which the project loses once the edit replaces its entry. A sample
 * edited before lineages existed has an origin and none, so it can't revert.
 */

/** The lineage of the result of an in-place edit of `old` that moved positions by `steps`; none when `old` can't revert. */
export const lineageAfter = (old: SampleInfo, steps: readonly RemapStep[]): SampleLineage | undefined => {
  if (old.lineage) return { original: old.lineage.original, steps: [...old.lineage.steps, ...steps] }
  if (old.origin !== undefined) return undefined
  const { extension, bytes, channels, durationSeconds, sampleRate } = old
  return { original: { extension, bytes, channels, durationSeconds, sampleRate }, steps: [...steps] }
}

/** Why a sample can't revert, or null when it can. */
export const revertBlocked = (info: SampleInfo): string | null => {
  if (info.origin === undefined) return 'This is the original'
  if (!info.lineage) return 'Edited before Revert was possible'
  return null
}

/**
 * The original's `SampleInfo`, as it would stand in the project: the origin's id and facts, the present name, and no
 * marks (`replaceSample` brings them back through `revertRemap`). Null when the sample can't revert.
 */
export const originalInfo = (info: SampleInfo): SampleInfo | null =>
  revertBlocked(info) === null ? { id: originOf(info), name: info.name, ...info.lineage!.original } : null

/**
 * Where positions of the present version are in the original: each step's inverse, the last first, from the present
 * length to the original's. Positions in audio only a later version has go as any edit takes audio that is gone.
 */
export const revertRemap = (info: SampleInfo): SampleRemap | null => {
  if (revertBlocked(info) !== null) return null
  const steps = info.lineage!.steps.map(inverseStep).reverse()
  return remapOfSteps(steps, savedFrameCount(info), savedFrameCount(info.lineage!.original))
}
