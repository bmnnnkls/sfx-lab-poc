import { duplicateAutomation } from '../automation'
import { createId } from '../shared'
import type { AudioClip, Clip, Project, Track } from './types'

/** Whether a clip value plays on a track of this kind: MIDI clips on instrument tracks, audio clips on audio tracks. */
export const clipFitsTrack = (clip: Clip | AudioClip, track: Track | undefined): boolean =>
  !!track && track.kind !== 'return' && ('notes' in clip ? track.kind === 'instrument' : track.kind === 'audio')

/** Its lanes moved to `trackId`'s controls; a lane whose target isn't on that track shows as unavailable. */
export const movedTo = <T extends Clip | AudioClip>(clip: T, trackId: string): T => {
  const automation = clip.automation?.map((lane) => ({ ...lane, target: { ...lane.target, owner: { kind: 'track' as const, trackId } } }))
  return { ...clip, ...(automation && { automation }) }
}

/**
 * A copy of a clip value for a track: fresh clip, note, lane and point ids, its lanes moved to that track. For the
 * session grid and for a region's content alike.
 */
export const clipCopyFor = <T extends Clip | AudioClip>(project: Project, clip: T, trackId: string): T => {
  const authored = movedTo(clip, trackId)
  return {
    ...authored,
    id: createId('clip'),
    ...('notes' in authored ? { notes: authored.notes.map((note) => ({ ...note, id: createId('note') })) } : {}),
    ...(authored.automation && { automation: duplicateAutomation(authored.automation, {}, project) }),
  }
}

const withClipAt = (project: Project, trackId: string, scene: number, clip: Clip | AudioClip, removeId?: { trackId: string; clipId: string }): Project => ({
  ...project,
  tracks: project.tracks.map((track): Track => track.kind === 'return' ? track : ({
    ...track,
    clips: track.clips.map((existing, index) => track.id === trackId && index === scene ? clip : removeId && track.id === removeId.trackId && existing?.id === removeId.clipId ? null : existing),
  } as Track)),
})

/** An empty slot of a track of the clip's kind. */
const fitsSlot = (project: Project, clip: Clip | AudioClip, trackId: string, scene: number): boolean => {
  const track = project.tracks.find((candidate) => candidate.id === trackId)
  return clipFitsTrack(clip, track) && Number.isInteger(scene) && scene >= 0 && scene < project.sceneCount && track?.kind !== 'return' && !track?.clips[scene]
}

/** Whether a clip value can be pasted into a slot: an empty slot of a track of its kind, and an audio clip's sample still in the project. */
export const canPasteSessionClip = (project: Project, clip: Clip | AudioClip, trackId: string, scene: number): boolean =>
  fitsSlot(project, clip, trackId, scene) && ('notes' in clip || project.samples.some((sample) => sample.id === clip.sampleId))

/** Puts a copy of a clip value (`clipCopyFor`) into an empty slot. The same project when it can't be pasted there. */
export const pasteSessionClip = (project: Project, clip: Clip | AudioClip, trackId: string, scene: number): Project =>
  canPasteSessionClip(project, clip, trackId, scene) ? withClipAt(project, trackId, scene, clipCopyFor(project, clip, trackId)) : project

/** A clip copy has independent point/note IDs; moving keeps its identity. Target IDs remain structural. */
export const copySessionClip = (project: Project, sourceTrackId: string, clipId: string, destinationTrackId: string, scene: number, move = false): Project => {
  const source = project.tracks.find((t) => t.id === sourceTrackId), destination = project.tracks.find((t) => t.id === destinationTrackId)
  if (!source || source.kind === 'return' || !destination || destination.kind !== source.kind) return project
  const clip = source.clips.find((c) => c?.id === clipId)
  if (!clip) return project
  if (!fitsSlot(project, clip, destinationTrackId, scene)) return project
  return move
    ? withClipAt(project, destinationTrackId, scene, movedTo(clip, destinationTrackId), { trackId: sourceTrackId, clipId })
    : withClipAt(project, destinationTrackId, scene, clipCopyFor(project, clip, destinationTrackId))
}
