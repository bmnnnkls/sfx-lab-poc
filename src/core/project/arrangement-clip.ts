import { clamp, createId } from '../shared'
import { clampAudioClip } from './audio-clip'
import { trimNotesToLength } from './note-edit'
import { MAX_CLIP_BEATS, MAX_TIMELINE_BEATS, MIN_CLIP_BEATS } from './limits'
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
  /**
   * Repeat the clip on the timeline (default false: the region plays once). The loop ends at the
   * next region on that track, or — when none follows — at the region's own end.
   */
  readonly loop?: boolean
}

export const isAudioContent = (content: Clip | AudioClip): content is AudioClip => 'sampleId' in content

/** Where the region stops on the timeline, in beats. */
export const arrangementEnd = (region: ArrangementClip): number => region.startBeat + region.content.lengthBeats

/**
 * Where the region stops *sounding*, in beats: its own end, or — when it loops — the start of the
 * next region on the same track (any region, looping or not, cuts the loop). A looping region with
 * no next region stops at its own end. Regions starting at the same beat do not cut each other.
 */
export const arrangementLoopEnd = (region: ArrangementClip, regions: readonly ArrangementClip[]): number => {
  if (region.loop !== true) return arrangementEnd(region)
  let next: number | null = null
  for (const candidate of regions) {
    if (candidate.id === region.id || candidate.trackId !== region.trackId) continue
    if (candidate.startBeat > region.startBeat) next = next === null ? candidate.startBeat : Math.min(next, candidate.startBeat)
  }
  return next ?? arrangementEnd(region)
}

/** A region that overlaps the half-open beat range [from, to). */
export const arrangementOverlaps = (region: ArrangementClip, from: number, to: number): boolean =>
  region.startBeat < to && arrangementEnd(region) > from

/** Where a region of `lengthBeats` may start: from 0 to where it ends at the timeline's end (`MAX_TIMELINE_BEATS`). */
export const clampStartBeat = (startBeat: number, lengthBeats: number): number => clamp(startBeat, 0, MAX_TIMELINE_BEATS - lengthBeats)

/**
 * Where the timeline's content ends, in beats: the last beat any region sounds (its loop end), 0 with none. The view
 * draws a few bars past it, and *Zoom to fit* shows up to it.
 */
export const timelineEnd = (regions: readonly ArrangementClip[]): number => {
  let end = 0
  for (const region of regions) end = Math.max(end, arrangementLoopEnd(region, regions))
  return end
}

/** A copy of `content` placed on `trackId`'s timeline at `startBeat`. Fresh ids, same content. */
export const createArrangementClip = (trackId: string, startBeat: number, content: Clip | AudioClip): ArrangementClip => {
  const placed = isAudioContent(content) ? clampAudioClip(content) : content
  return { id: createId('arr'), trackId, startBeat: clampStartBeat(startBeat, placed.lengthBeats), content: placed }
}

/** The regions of one track, in timeline order. */
export const arrangementOnTrack = (
  regions: readonly ArrangementClip[],
  trackId: string,
): readonly ArrangementClip[] =>
  regions
    .filter((region) => region.trackId === trackId)
    .sort((a, b) => a.startBeat - b.startBeat)

export interface ArrangementChanges {
  readonly trackId?: string
  readonly startBeat?: number
  readonly loop?: boolean
  readonly content?: Clip | AudioClip
}

/** Edits one region's track, position, loop or content, keeping the values in range. No change keeps the same array. */
export const updateArrangementClip = (
  regions: readonly ArrangementClip[],
  id: string,
  changes: ArrangementChanges,
): readonly ArrangementClip[] => {
  let changed = false
  const next = regions.map((region) => {
    if (region.id !== id) return region
    const content = changes.content ? normalizeContent(changes.content) : region.content
    const startBeat = clampStartBeat(changes.startBeat ?? region.startBeat, content.lengthBeats)
    const trackId = changes.trackId ?? region.trackId
    const loop = changes.loop ?? region.loop
    if (content === region.content && startBeat === region.startBeat && trackId === region.trackId && loop === region.loop) return region
    changed = true
    return { ...region, trackId, startBeat, loop, content }
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
