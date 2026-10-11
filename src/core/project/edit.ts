import { clearSampleReferences, createDefaultPatch, createSamplerPatch } from '../patch'
import type { ModuleDefinition, Patch } from '../patch'
import type { SampleInfo } from '../sample'
import { clamp, createId } from '../shared'
import { createNote, notesEqual, shiftedCopies, trimNotesToLength } from './note-edit'
import { clampAudioClip, createAudioClip } from './audio-clip'
import { MAX_CLIP_BEATS, MIN_CLIP_BEATS } from './limits'
import type { AudioClip, AudioTrack, Clip, InstrumentTrack, Note, Project, Track } from './types'

export { MAX_CLIP_BEATS, MIN_CLIP_BEATS }

export const MIN_TEMPO = 40
export const MAX_TEMPO = 240
export const DEFAULT_SCENE_COUNT = 4
export const MAX_NAME_LENGTH = 80
export const MIN_VOICES = 1
export const MAX_VOICES = 16
export const DEFAULT_VOICES = 8

/** `change` applied to every module; the same array when none of them changed. */
export const mapModules = (
  modules: readonly ModuleDefinition[],
  change: (module: ModuleDefinition) => ModuleDefinition,
): readonly ModuleDefinition[] => {
  const next = modules.map(change)
  return next.every((module, index) => module === modules[index]) ? modules : next
}

const updateTrack = (project: Project, trackId: string, change: (track: Track) => Track): Project => {
  const tracks = project.tracks.map((track) => (track.id === trackId ? change(track) : track))
  return tracks.every((track, index) => track === project.tracks[index]) ? project : { ...project, tracks }
}

/** Applies `change` to an instrument track; audio tracks (and unknown ids) are left untouched. */
const updateInstrument = (
  project: Project,
  trackId: string,
  change: (track: InstrumentTrack) => InstrumentTrack,
): Project => updateTrack(project, trackId, (track) => (track.kind === 'instrument' ? change(track) : track))

const updateAudio = (
  project: Project,
  trackId: string,
  change: (track: AudioTrack) => AudioTrack,
): Project => updateTrack(project, trackId, (track) => (track.kind === 'audio' ? change(track) : track))

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
): InstrumentTrack => ({
  kind: 'instrument',
  id: createId('track'),
  name,
  volume: 0.8,
  voices,
  patch,
  clips: Array.from({ length: sceneCount }, () => null),
})

export const createAudioTrack = (name: string, sceneCount: number): AudioTrack => ({
  kind: 'audio',
  id: createId('track'),
  name,
  volume: 0.8,
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
  updateInstrument(project, trackId, (track) => ({
    ...track,
    voices: Math.round(clamp(voices, MIN_VOICES, MAX_VOICES)),
  }))

export const setTrackPatch = (project: Project, trackId: string, patch: Patch): Project =>
  updateInstrument(project, trackId, (track) => ({ ...track, patch }))

export const setClipAt = (
  project: Project,
  trackId: string,
  scene: number,
  clip: Clip | null,
): Project =>
  updateInstrument(project, trackId, (track) => ({
    ...track,
    clips: track.clips.map((existing, index) => (index === scene ? clip : existing)),
  }))

const updateClip = (
  project: Project,
  trackId: string,
  clipId: string,
  change: (clip: Clip) => Clip,
): Project =>
  updateInstrument(project, trackId, (track) => {
    const clips = track.clips.map((clip) => (clip?.id === clipId ? change(clip) : clip))
    // Keep identity when nothing changed, so a no-op edit doesn't create an undo step.
    return clips.every((clip, index) => clip === track.clips[index]) ? track : { ...track, clips }
  })

/** Resizes a clip. Shortening trims notes that no longer fit (undo restores them). */
export const setClipLength = (
  project: Project,
  trackId: string,
  clipId: string,
  lengthBeats: number,
): Project =>
  updateClip(project, trackId, clipId, (clip) => {
    const length = clamp(lengthBeats, MIN_CLIP_BEATS, MAX_CLIP_BEATS)
    if (length === clip.lengthBeats) return clip
    return { ...clip, lengthBeats: length, notes: trimNotesToLength(clip.notes, length) }
  })

/** Doubles a clip's length and repeats its notes into the new half ("double loop"). */
export const doubleClip = (project: Project, trackId: string, clipId: string): Project =>
  updateClip(project, trackId, clipId, (clip) => {
    const length = clip.lengthBeats * 2
    if (length > MAX_CLIP_BEATS) return clip
    return {
      ...clip,
      lengthBeats: length,
      notes: [...clip.notes, ...shiftedCopies(clip.notes, clip.lengthBeats)],
    }
  })

export const setClipNotes = (
  project: Project,
  trackId: string,
  clipId: string,
  notes: readonly Note[],
): Project =>
  // Identical notes keep the same project, so e.g. quantizing an already-quantized clip adds no undo step.
  updateClip(project, trackId, clipId, (clip) =>
    notesEqual(clip.notes, notes) ? clip : { ...clip, notes },
  )

export const setProjectName = (project: Project, name: string): Project => ({
  ...project,
  name: name.slice(0, MAX_NAME_LENGTH),
})

/** A blank project with a single empty track. */
export const createEmptyProject = (): Project =>
  addTrack(
    { name: 'Untitled', tempo: 120, sceneCount: DEFAULT_SCENE_COUNT, samples: [], modules: [], tracks: [] },
    createTrack('Track 1', DEFAULT_SCENE_COUNT),
  )

/** Adds samples to the library, ignoring any whose id is already there. */
export const addSamples = (project: Project, samples: readonly SampleInfo[]): Project => {
  const known = new Set(project.samples.map((sample) => sample.id))
  const fresh = samples.filter((sample) => !known.has(sample.id))
  return fresh.length === 0 ? project : { ...project, samples: [...project.samples, ...fresh] }
}

/**
 * Removes a sample from the library together with whatever played it: sampler nodes are cleared and audio
 * clips using it are removed (undo restores everything).
 */
export const removeSample = (project: Project, sampleId: string): Project => ({
  ...project,
  samples: project.samples.filter((sample) => sample.id !== sampleId),
  modules: mapModules(project.modules, (module) => {
    const patch = clearSampleReferences(module.patch, sampleId)
    return patch === module.patch ? module : { ...module, patch }
  }),
  tracks: project.tracks.map((track): Track => {
    if (track.kind === 'audio') {
      const clips = track.clips.map((clip) => (clip?.sampleId === sampleId ? null : clip))
      return clips.some((clip, index) => clip !== track.clips[index]) ? { ...track, clips } : track
    }
    const patch = clearSampleReferences(track.patch, sampleId)
    return patch === track.patch ? track : { ...track, patch }
  }),
})

const SAMPLER_NOTE = 60

/** A ready-to-play track: a sampler loaded with `sample` and a one-bar clip that triggers it. */
export const addSamplerTrack = (project: Project, sample: SampleInfo): Project => {
  const clip = createClip(sample.name, 4, [createNote(SAMPLER_NOTE, 0, 1)])
  const track = createTrack(sample.name, project.sceneCount, createSamplerPatch(sample.id))
  return addTrack(project, { ...track, clips: track.clips.map((slot, scene) => (scene === 0 ? clip : slot)) })
}

export const setAudioClipAt = (
  project: Project,
  trackId: string,
  scene: number,
  clip: AudioClip | null,
): Project =>
  updateAudio(project, trackId, (track) => ({
    ...track,
    clips: track.clips.map((existing, index) => (index === scene ? clip : existing)),
  }))

export type AudioClipChanges = Partial<
  Pick<AudioClip, 'name' | 'sampleId' | 'lengthBeats' | 'loop' | 'warp' | 'gain' | 'start' | 'end' | 'fadeIn' | 'fadeOut'>
>

/** Edits an audio clip's settings, keeping them in range. No change keeps the same project (no empty undo step). */
export const updateAudioClip = (
  project: Project,
  trackId: string,
  clipId: string,
  changes: AudioClipChanges,
): Project =>
  updateAudio(project, trackId, (track) => {
    const clips = track.clips.map((clip) => (clip?.id === clipId ? clampAudioClip({ ...clip, ...changes }) : clip))
    const unchanged = clips.every((clip, index) => {
      const before = track.clips[index]
      return clip === before || (clip && before && JSON.stringify(clip) === JSON.stringify(before))
    })
    return unchanged ? track : { ...track, clips }
  })

/** Puts a new audio clip for `sample` in a slot, at the project tempo's best-guess length. */
export const addAudioClip = (project: Project, trackId: string, scene: number, sample: SampleInfo): Project =>
  setAudioClipAt(project, trackId, scene, createAudioClip(sample, project.tempo))

/** A ready-to-play audio track: `sample` as a looping clip in the first scene. */
export const addAudioTrackWithClip = (project: Project, sample: SampleInfo): Project => {
  const track = createAudioTrack(sample.name, project.sceneCount)
  const clip = createAudioClip(sample, project.tempo)
  return addTrack(project, { ...track, clips: track.clips.map((slot, scene) => (scene === 0 ? clip : slot)) })
}
