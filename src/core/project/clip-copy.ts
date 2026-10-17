import { duplicateAutomation } from '../automation'
import { createId } from '../shared'
import type { AudioClip, Clip, Project, Track } from './types'

/** A clip copy has independent point/note IDs; moving keeps its identity. Target IDs remain structural. */
export const copySessionClip = (project: Project, sourceTrackId: string, clipId: string, destinationTrackId: string, scene: number, move = false): Project => {
  const source = project.tracks.find((t) => t.id === sourceTrackId), destination = project.tracks.find((t) => t.id === destinationTrackId)
  if (!source || source.kind === 'return' || !destination || destination.kind !== source.kind || scene < 0 || scene >= project.sceneCount || !Number.isInteger(scene) || destination.clips[scene]) return project
  const clip = source.clips.find((c) => c?.id === clipId)
  if (!clip) return project
  const automation = clip.automation?.map((lane) => ({ ...lane, target: { ...lane.target, owner: { kind: 'track' as const, trackId: destinationTrackId } } }))
  const authored = { ...clip, ...(automation && { automation }) }
  const copy: Clip | AudioClip = move ? authored : {
    ...authored, id: createId('clip'),
    ...('notes' in authored ? { notes: authored.notes.map((note) => ({ ...note, id: createId('note') })) } : {}),
    ...(authored.automation && { automation: duplicateAutomation(authored.automation, {}, project) }),
  }
  return { ...project, tracks: project.tracks.map((track): Track => track.kind === 'return' ? track : ({ ...track, clips: track.clips.map((existing, index) => track.id === destinationTrackId && index === scene ? copy : move && track.id === sourceTrackId && existing?.id === clipId ? null : existing) } as Track)) }
}
