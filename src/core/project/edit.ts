import { clearSampleReferences, createDefaultPatch, createSamplerPatch } from '../patch'
import type { Patch } from '../patch'
import type { SampleInfo } from '../sample'
import { clamp, createId } from '../shared'
import type { Clip, Note, Project, Track } from './types'

export const MIN_TEMPO = 40
export const MAX_TEMPO = 240
export const DEFAULT_SCENE_COUNT = 4
export const MAX_NAME_LENGTH = 80
export const MIN_VOICES = 1
export const MAX_VOICES = 16
export const DEFAULT_VOICES = 8

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
  voices: number = DEFAULT_VOICES,
): Track => ({
  id: createId('track'),
  name,
  volume: 0.8,
  voices,
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

export const setTrackVoices = (project: Project, trackId: string, voices: number): Project =>
  updateTrack(project, trackId, (track) => ({
    ...track,
    voices: Math.round(clamp(voices, MIN_VOICES, MAX_VOICES)),
  }))

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
    { name: 'Untitled', tempo: 120, sceneCount: DEFAULT_SCENE_COUNT, samples: [], tracks: [] },
    createTrack('Track 1', DEFAULT_SCENE_COUNT),
  )

/** Adds samples to the library, ignoring any whose id is already there. */
export const addSamples = (project: Project, samples: readonly SampleInfo[]): Project => {
  const known = new Set(project.samples.map((sample) => sample.id))
  const fresh = samples.filter((sample) => !known.has(sample.id))
  return fresh.length === 0 ? project : { ...project, samples: [...project.samples, ...fresh] }
}

/** Removes a sample from the library and clears every node that was playing it. */
export const removeSample = (project: Project, sampleId: string): Project => ({
  ...project,
  samples: project.samples.filter((sample) => sample.id !== sampleId),
  tracks: project.tracks.map((track) => {
    const patch = clearSampleReferences(track.patch, sampleId)
    return patch === track.patch ? track : { ...track, patch }
  }),
})

const SAMPLER_NOTE = 60

/** A ready-to-play track: a sampler loaded with `sample` and a one-bar clip that triggers it. */
export const addSamplerTrack = (project: Project, sample: SampleInfo): Project => {
  const clip = createClip(sample.name, 4, [
    { pitch: SAMPLER_NOTE, start: 0, duration: 1, velocity: 0.9 },
  ])
  const track = createTrack(sample.name, project.sceneCount, createSamplerPatch(sample.id))
  return addTrack(project, { ...track, clips: track.clips.map((slot, scene) => (scene === 0 ? clip : slot)) })
}
