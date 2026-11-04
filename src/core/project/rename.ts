import { updateTrack } from './edit'
import type { Project, Track } from './types'

/** The longest names a file keeps (the sanitizer cuts longer ones); the setters cut a name to the same length. */
export const NAME_LIMITS = { track: 40, group: 40, clip: 40, scene: 24, sample: 60 } as const

/** A name as typed: trimmed and cut to `limit`; null when nothing is left, so the old name stays. */
const cleaned = (name: string, limit: number): string | null => {
  const trimmed = name.trim().slice(0, limit)
  return trimmed === '' ? null : trimmed
}

export const setTrackName = (project: Project, trackId: string, name: string): Project => {
  const next = cleaned(name, NAME_LIMITS.track)
  return next === null ? project : updateTrack(project, trackId, (track) => (track.name === next ? track : { ...track, name: next }))
}

/** Renames a session clip. A region's content is a copy, so it keeps its own name. */
export const setClipName = (project: Project, trackId: string, clipId: string, name: string): Project => {
  const next = cleaned(name, NAME_LIMITS.clip)
  if (next === null) return project
  return updateTrack(project, trackId, (track): Track => {
    if (track.kind === 'return' || !track.clips.some((clip) => clip?.id === clipId && clip.name !== next)) return track
    return { ...track, clips: track.clips.map((clip) => (clip?.id === clipId ? { ...clip, name: next } : clip)) } as Track
  })
}

/** Names a scene, padding `sceneNames` with empty names up to it. An empty name clears it. */
export const setSceneName = (project: Project, scene: number, name: string): Project => {
  if (!Number.isInteger(scene) || scene < 0 || scene >= project.sceneCount) return project
  const next = name.trim().slice(0, NAME_LIMITS.scene)
  const names = Array.from({ length: Math.max(scene + 1, project.sceneNames?.length ?? 0) }, (_, index) => project.sceneNames?.[index] ?? '')
  if (names[scene] === next) return project
  names[scene] = next
  if (names.every((candidate) => candidate === '')) {
    const { sceneNames: _cleared, ...rest } = project
    return rest
  }
  return { ...project, sceneNames: names }
}

/** Renames a sample of the project; clips that play it keep their own names. */
export const setSampleName = (project: Project, sampleId: string, name: string): Project => {
  const next = cleaned(name, NAME_LIMITS.sample)
  if (next === null || !project.samples.some((sample) => sample.id === sampleId && sample.name !== next)) return project
  return { ...project, samples: project.samples.map((sample) => (sample.id === sampleId ? { ...sample, name: next } : sample)) }
}

/** Renames a group of tracks. */
export const setGroupName = (project: Project, groupId: string, name: string): Project => {
  const next = cleaned(name, NAME_LIMITS.group)
  if (next === null || !project.groups?.some((group) => group.id === groupId && group.name !== next)) return project
  return { ...project, groups: project.groups.map((group) => (group.id === groupId ? { ...group, name: next } : group)) }
}
