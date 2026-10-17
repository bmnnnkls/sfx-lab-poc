import { clamp, createId } from '../shared'
import { clampAudioClip } from './audio-clip'
import { trimNotesToLength } from './note-edit'
import { MAX_CLIP_BEATS, MIN_CLIP_BEATS } from './limits'
import type { AudioClip, Clip } from './types'

/**
 * A copy of a session clip placed on the arrangement timeline of one track, like Ableton's
 * arrangement view: the same content at its own position in time, independent of the session grid.
 * Regions may overlap on one track (both play); the newest start wins for audio.
 */
export interface ArrangementClip {
  readonly id: string
  /** Which track's timeline this sits on. */
  readonly trackId: string
  /** Absolute timeline position, in beats from the start of the song. */
  readonly startBeat: number
  /** Copied content: a MIDI clip (notes) or an audio clip (sample, warp, trim, fades). */
  readonly content: Clip | AudioClip
}

export const isAudioContent = (content: Clip | AudioClip): content is AudioClip => 'sampleId' in content

/** Where the region stops on the timeline, in beats. */
export const arrangementEnd = (region: ArrangementClip): number => region.startBeat + region.content.lengthBeats

/** A region that overlaps the half-open beat range [from, to). */
export const arrangementOverlaps = (region: ArrangementClip, from: number, to: number): boolean =>
  region.startBeat < to && arrangementEnd(region) > from

/** A copy of `content` placed on `trackId`'s timeline at `startBeat`. Fresh ids, same content. */
export const createArrangementClip = (trackId: string, startBeat: number, content: Clip | AudioClip): ArrangementClip => ({
  id: createId('arr'),
  trackId,
  startBeat: Math.max(0, startBeat),
  content: isAudioContent(content) ? clampAudioClip(content) : content,
})

/** The regions of one track, in timeline order. */
export const arrangementOnTrack = (
  regions: readonly ArrangementClip[],
  trackId: string,
): readonly ArrangementClip[] =>
  regions
    .filter((region) => region.trackId === trackId)
    .sort((a, b) => a.startBeat - b.startBeat)

export interface ArrangementChanges {
  readonly startBeat?: number
  readonly content?: Clip | AudioClip
}

/** Edits one region's position or content, keeping the values in range. No change keeps the same array. */
export const updateArrangementClip = (
  regions: readonly ArrangementClip[],
  id: string,
  changes: ArrangementChanges,
): readonly ArrangementClip[] => {
  let changed = false
  const next = regions.map((region) => {
    if (region.id !== id) return region
    const content = changes.content ? normalizeContent(changes.content) : region.content
    const startBeat = Math.max(0, changes.startBeat ?? region.startBeat)
    if (content === region.content && startBeat === region.startBeat) return region
    changed = true
    return { ...region, startBeat, content }
  })
  return changed ? next : regions
}

/** Adds a region (a duplicate of an existing one gets a fresh id). */
export const addArrangementClip = (
  regions: readonly ArrangementClip[],
  region: ArrangementClip,
): readonly ArrangementClip[] => [...regions, region]

export const removeArrangementClip = (
  regions: readonly ArrangementClip[],
  id: string,
): readonly ArrangementClip[] => regions.filter((region) => region.id !== id)

/** Keeps content in range: audio clips are clamped, MIDI clips trimmed to their new length. */
const normalizeContent = (content: Clip | AudioClip): Clip | AudioClip =>
  isAudioContent(content)
    ? clampAudioClip(content)
    : { ...content, lengthBeats: clamp(content.lengthBeats, MIN_CLIP_BEATS, MAX_CLIP_BEATS), notes: trimNotesToLength(content.notes, clamp(content.lengthBeats, MIN_CLIP_BEATS, MAX_CLIP_BEATS)) }
