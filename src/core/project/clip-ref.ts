import type { AudioClip, Clip, Project, Track } from './types'

/**
 * Which clip an edit goes to: a session clip in its slot, by track and clip id, or a region's own copy on the
 * arrangement, by region id. The clip setters take one, so the clip editor edits either the same way.
 */
export type ClipRef =
  | { readonly kind: 'session'; readonly trackId: string; readonly clipId: string }
  | { readonly kind: 'region'; readonly regionId: string }

export const sessionClipRef = (trackId: string, clipId: string): ClipRef => ({ kind: 'session', trackId, clipId })

export const regionClipRef = (regionId: string): ClipRef => ({ kind: 'region', regionId })

/** The clip a ref points at, or undefined once it is gone. */
export const clipAt = (project: Project, ref: ClipRef): Clip | AudioClip | undefined => {
  if (ref.kind === 'region') return project.arrangement?.find((region) => region.id === ref.regionId)?.content
  const track = project.tracks.find((candidate) => candidate.id === ref.trackId)
  return track && track.kind !== 'return' ? (track.clips.find((clip) => clip?.id === ref.clipId) ?? undefined) : undefined
}

/**
 * Edits the clip a ref points at: a session clip in its slot, or a region's content. The same project when `change`
 * returns the clip it was given or the ref points at nothing, so a no-op edit adds no undo step.
 */
export const editClipAt = (project: Project, ref: ClipRef, change: (clip: Clip | AudioClip) => Clip | AudioClip): Project => {
  if (ref.kind === 'region') {
    const regions = project.arrangement ?? []
    const region = regions.find((candidate) => candidate.id === ref.regionId)
    const content = region && change(region.content)
    if (!region || !content || content === region.content) return project
    return { ...project, arrangement: regions.map((candidate) => (candidate === region ? { ...region, content } : candidate)) }
  }
  const track = project.tracks.find((candidate) => candidate.id === ref.trackId)
  if (!track || track.kind === 'return') return project
  const clip = track.clips.find((candidate) => candidate?.id === ref.clipId)
  const changed = clip && change(clip)
  if (!clip || !changed || changed === clip) return project
  const edited = { ...track, clips: track.clips.map((candidate) => (candidate === clip ? changed : candidate)) } as Track
  return { ...project, tracks: project.tracks.map((candidate) => (candidate === track ? edited : candidate)) }
}
