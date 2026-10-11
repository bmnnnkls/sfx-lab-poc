import {
  type Clip,
  type Note,
  type Patch,
  type Project,
  addTrack,
  createClip,
  createDemoProject,
  createTrack,
  removeTrack,
  setClipAt,
  setClipNotes,
  setProjectName,
  setTempo,
  setTrackPatch,
  setTrackVolume,
} from '@core'
import { create } from 'zustand'

const DEFAULT_CLIP_BEATS = 4

interface ProjectActions {
  /** Swaps in a whole different project (import, new, restore, startup load). */
  replaceProject(project: Project): void
  setName(name: string): void
  setTempo(bpm: number): void
  addTrack(): void
  removeTrack(trackId: string): void
  setTrackVolume(trackId: string, volume: number): void
  /** Applies a pure patch edit (see `@core` patch functions) to a track's instrument. */
  updatePatch(trackId: string, edit: (patch: Patch) => Patch): void
  createClip(trackId: string, scene: number): Clip
  deleteClip(trackId: string, scene: number): void
  setClipNotes(trackId: string, clipId: string, notes: readonly Note[]): void
}

export interface ProjectState extends ProjectActions {
  readonly project: Project
}

/** The document: the single source of truth for everything the user authors. */
export const useProjectStore = create<ProjectState>((set) => {
  const edit = (change: (project: Project) => Project) =>
    set((state) => ({ project: change(state.project) }))

  return {
    project: createDemoProject(),

    replaceProject: (project) => set({ project }),
    setName: (name) => edit((project) => setProjectName(project, name)),
    setTempo: (bpm) => edit((project) => setTempo(project, bpm)),
    addTrack: () =>
      edit((project) =>
        addTrack(project, createTrack(`Track ${project.tracks.length + 1}`, project.sceneCount)),
      ),
    removeTrack: (trackId) => edit((project) => removeTrack(project, trackId)),
    setTrackVolume: (trackId, volume) => edit((project) => setTrackVolume(project, trackId, volume)),

    updatePatch: (trackId, change) =>
      edit((project) => {
        const track = project.tracks.find((candidate) => candidate.id === trackId)
        return track ? setTrackPatch(project, trackId, change(track.patch)) : project
      }),

    createClip: (trackId, scene) => {
      const clip = createClip(`Clip ${scene + 1}`, DEFAULT_CLIP_BEATS)
      edit((project) => setClipAt(project, trackId, scene, clip))
      return clip
    },
    deleteClip: (trackId, scene) => edit((project) => setClipAt(project, trackId, scene, null)),
    setClipNotes: (trackId, clipId, notes) =>
      edit((project) => setClipNotes(project, trackId, clipId, notes)),
  }
})

export const selectTrack = (state: ProjectState, trackId: string | null) =>
  state.project.tracks.find((track) => track.id === trackId)

