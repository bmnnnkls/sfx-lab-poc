import {
  type Clip,
  type History,
  type Note,
  type Patch,
  type Project,
  addTrack,
  canRedo,
  canUndo,
  commit,
  createClip,
  createDemoProject,
  createHistory,
  createTrack,
  redo,
  removeTrack,
  setClipAt,
  setClipNotes,
  setProjectName,
  setTempo,
  setTrackPatch,
  setTrackVolume,
  undo,
} from '@core'
import { create } from 'zustand'

const DEFAULT_CLIP_BEATS = 4

interface ProjectActions {
  /** Loads a project as the starting point (app startup): history begins empty. */
  resetProject(project: Project): void
  /** Swaps in a whole different project (import, new, restore) as one undoable step. */
  replaceProject(project: Project): void
  undo(): void
  redo(): void
  setName(name: string): void
  setTempo(bpm: number): void
  addTrack(): void
  removeTrack(trackId: string): void
  setTrackVolume(trackId: string, volume: number): void
  /**
   * Applies a pure patch edit (see `@core` patch functions) to a track's instrument.
   * Rapid edits sharing a `mergeKey` (a slider or node drag) collapse into one undo step.
   */
  updatePatch(trackId: string, edit: (patch: Patch) => Patch, mergeKey?: string): void
  createClip(trackId: string, scene: number): Clip
  deleteClip(trackId: string, scene: number): void
  setClipNotes(trackId: string, clipId: string, notes: readonly Note[]): void
}

export interface ProjectState extends ProjectActions {
  /** The current project; always equal to `history.present`. */
  readonly project: Project
  readonly history: History<Project>
}

const demo = createDemoProject()

/** The document: the single source of truth for everything the user authors, with undo/redo. */
export const useProjectStore = create<ProjectState>((set) => {
  const withHistory = (history: History<Project>) => ({ history, project: history.present })

  const edit = (change: (project: Project) => Project, mergeKey?: string) =>
    set((state) => {
      const history = commit(state.history, change(state.project), {
        key: mergeKey,
        now: Date.now(),
      })
      return history === state.history ? state : withHistory(history)
    })

  return {
    project: demo,
    history: createHistory(demo),

    resetProject: (project) => set(withHistory(createHistory(project))),
    replaceProject: (project) => edit(() => project),
    undo: () => set((state) => withHistory(undo(state.history))),
    redo: () => set((state) => withHistory(redo(state.history))),

    setName: (name) => edit((project) => setProjectName(project, name), 'name'),
    setTempo: (bpm) => edit((project) => setTempo(project, bpm), 'tempo'),
    addTrack: () =>
      edit((project) =>
        addTrack(project, createTrack(`Track ${project.tracks.length + 1}`, project.sceneCount)),
      ),
    removeTrack: (trackId) => edit((project) => removeTrack(project, trackId)),
    setTrackVolume: (trackId, volume) =>
      edit((project) => setTrackVolume(project, trackId, volume), `volume:${trackId}`),

    updatePatch: (trackId, change, mergeKey) =>
      edit((project) => {
        const track = project.tracks.find((candidate) => candidate.id === trackId)
        return track ? setTrackPatch(project, trackId, change(track.patch)) : project
      }, mergeKey),

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

export const selectCanUndo = (state: ProjectState): boolean => canUndo(state.history)
export const selectCanRedo = (state: ProjectState): boolean => canRedo(state.history)
