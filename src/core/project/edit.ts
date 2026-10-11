import { createDefaultPatch } from '../patch'
import type { Patch } from '../patch'
import { clamp, createId } from '../shared'
import type { Clip, Note, Project, Track } from './types'

export const MIN_TEMPO = 40
export const MAX_TEMPO = 240
export const DEFAULT_SCENE_COUNT = 4
export const MAX_NAME_LENGTH = 80

const updateTrack = (project: Project, trackId: string, change: (track: Track) => Track): Project => ({
  ...project,
  tracks: project.tracks.map((track) => (track.id === trackId ? change(track) : track)),
})

export const createClip = (name: string, lengthBeats: number, notes: readonly Note[] = []): Clip => ({
  id: createId('clip'),
  name,
  lengthBeats,
  notes,
})

export const createTrack = (
  name: string,
  sceneCount: number,
  patch: Patch = createDefaultPatch(),
): Track => ({
  id: createId('track'),
  name,
  volume: 0.8,
  patch,
  clips: Array.from({ length: sceneCount }, () => null),
})

export const addTrack = (project: Project, track: Track): Project => ({
  ...project,
  tracks: [...project.tracks, track],
})

export const removeTrack = (project: Project, trackId: string): Project => ({
  ...project,
  tracks: project.tracks.filter((track) => track.id !== trackId),
})

export const setTempo = (project: Project, tempo: number): Project => ({
  ...project,
  tempo: clamp(tempo, MIN_TEMPO, MAX_TEMPO),
})

export const setTrackVolume = (project: Project, trackId: string, volume: number): Project =>
  updateTrack(project, trackId, (track) => ({ ...track, volume: clamp(volume, 0, 1) }))

export const setTrackPatch = (project: Project, trackId: string, patch: Patch): Project =>
  updateTrack(project, trackId, (track) => ({ ...track, patch }))

export const setClipAt = (
  project: Project,
  trackId: string,
  scene: number,
  clip: Clip | null,
): Project =>
  updateTrack(project, trackId, (track) => ({
    ...track,
    clips: track.clips.map((existing, index) => (index === scene ? clip : existing)),
  }))

export const setClipNotes = (
  project: Project,
  trackId: string,
  clipId: string,
  notes: readonly Note[],
): Project =>
  updateTrack(project, trackId, (track) => ({
    ...track,
    clips: track.clips.map((clip) => (clip?.id === clipId ? { ...clip, notes } : clip)),
  }))

export const setProjectName = (project: Project, name: string): Project => ({
  ...project,
  name: name.slice(0, MAX_NAME_LENGTH),
})

/** A blank project with a single empty track. */
export const createEmptyProject = (): Project =>
  addTrack(
    { name: 'Untitled', tempo: 120, sceneCount: DEFAULT_SCENE_COUNT, tracks: [] },
    createTrack('Track 1', DEFAULT_SCENE_COUNT),
  )
