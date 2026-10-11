import {
  type Clip,
  type History,
  type ModuleDefinition,
  type Note,
  type Patch,
  type PatchTarget,
  type Project,
  type AudioClipChanges,
  type SampleInfo,
  addAudioClip,
  addModuleUse,
  addNoteEffect,
  moveNoteEffect,
  removeNoteEffect,
  setNoteEffectBypassed,
  setNoteEffectParam,
  addAudioTrackWithClip,
  setAudioClipAt,
  addSamplerTrack,
  addSamples,
  addTrack,
  canRedo,
  canUndo,
  commit,
  createAudioTrack,
  createClip,
  createDemoProject,
  createHistory,
  createTrack,
  doubleClip,
  editPatchAt,
  groupNodesAsModule,
  removeModule,
  unlinkModuleNode,
  updateModule,
  redo,
  removeSample,
  removeTrack,
  setClipAt,
  setClipLength,
  setClipNotes,
  setProjectName,
  setTempo,
  setTrackVoices,
  setTrackVolume,
  undo,
  updateAudioClip,
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
  /** Adds an empty instrument track. */
  addTrack(): void
  /** Adds an empty audio track. */
  addAudioTrack(): void
  removeTrack(trackId: string): void
  setTrackVolume(trackId: string, volume: number): void
  addSamples(samples: readonly SampleInfo[]): void
  removeSample(sampleId: string): void
  /** Adds a track with a sampler playing `sample`, plus a clip that triggers it. */
  addSamplerTrack(sample: SampleInfo): void
  /** Adds an audio track with a looping clip of `sample` in the first scene. */
  addAudioTrackFromSample(sample: SampleInfo): void
  /** Empties a slot of an audio track. */
  deleteAudioClip(trackId: string, scene: number): void
  /** Puts a new audio clip of `sample` into a slot of an audio track. */
  createAudioClip(trackId: string, scene: number, sample: SampleInfo): void
  /** Edits an audio clip; rapid edits of the same setting (a slider drag) merge into one undo step. */
  updateAudioClip(trackId: string, clipId: string, changes: AudioClipChanges): void
  setTrackVoices(trackId: string, voices: number): void
  /** Appends a MIDI effect to the end of a track's chain. */
  addNoteEffect(trackId: string, type: string): void
  removeNoteEffect(trackId: string, effectId: string): void
  /** Moves an effect along the chain (negative = earlier). */
  moveNoteEffect(trackId: string, effectId: string, delta: number): void
  /** Rapid changes of one parameter (a slider drag) merge into one undo step. */
  setNoteEffectParam(trackId: string, effectId: string, paramId: string, value: number): void
  setNoteEffectBypassed(trackId: string, effectId: string, bypassed: boolean): void
  /**
   * Applies a pure patch edit (see `@core` patch functions) to a track's instrument.
   * Rapid edits sharing a `mergeKey` (a slider or node drag) collapse into one undo step.
   */
  updatePatch(
    trackId: string,
    edit: (patch: Patch, modules: readonly ModuleDefinition[]) => Patch,
    mergeKey?: string,
  ): void
  /** Like `updatePatch`, for a patch inside a module (which changes every use of that module). */
  updateModulePatch(
    moduleId: string,
    edit: (patch: Patch, modules: readonly ModuleDefinition[]) => Patch,
    mergeKey?: string,
  ): void
  /** Replaces the selected nodes of a patch by one use of a new module. */
  groupNodes(target: PatchTarget, nodeIds: readonly string[]): void
  addModuleUse(target: PatchTarget, moduleId: string, x: number, y: number): void
  /** Turns a use into an independent copy of the module's contents. */
  unlinkModule(target: PatchTarget, nodeId: string): void
  /** Changes a module's definition or interface; every use follows. */
  updateModule(moduleId: string, change: (module: ModuleDefinition) => ModuleDefinition, mergeKey?: string): void
  /** Deletes a module that nothing uses. */
  deleteModule(moduleId: string): void
  createClip(trackId: string, scene: number): Clip
  deleteClip(trackId: string, scene: number): void
  setClipNotes(trackId: string, clipId: string, notes: readonly Note[]): void
  /** Resizes a clip; shortening trims notes that no longer fit. */
  setClipLength(trackId: string, clipId: string, lengthBeats: number): void
  /** Doubles the clip's length and repeats its notes into the new half. */
  doubleClip(trackId: string, clipId: string): void
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
    addAudioTrack: () =>
      edit((project) =>
        addTrack(project, createAudioTrack(`Audio ${project.tracks.length + 1}`, project.sceneCount)),
      ),
    removeTrack: (trackId) => edit((project) => removeTrack(project, trackId)),
    setTrackVolume: (trackId, volume) =>
      edit((project) => setTrackVolume(project, trackId, volume), `volume:${trackId}`),

    addSamples: (samples) => edit((project) => addSamples(project, samples)),
    removeSample: (sampleId) => edit((project) => removeSample(project, sampleId)),
    addSamplerTrack: (sample) => edit((project) => addSamplerTrack(project, sample)),
    addAudioTrackFromSample: (sample) => edit((project) => addAudioTrackWithClip(project, sample)),
    deleteAudioClip: (trackId, scene) => edit((project) => setAudioClipAt(project, trackId, scene, null)),
    createAudioClip: (trackId, scene, sample) =>
      edit((project) => addAudioClip(project, trackId, scene, sample)),
    updateAudioClip: (trackId, clipId, changes) =>
      edit(
        (project) => updateAudioClip(project, trackId, clipId, changes),
        `audio:${clipId}:${Object.keys(changes).sort().join(',')}`,
      ),
    addNoteEffect: (trackId, type) => edit((project) => addNoteEffect(project, trackId, type)),
    removeNoteEffect: (trackId, effectId) => edit((project) => removeNoteEffect(project, trackId, effectId)),
    moveNoteEffect: (trackId, effectId, delta) => edit((project) => moveNoteEffect(project, trackId, effectId, delta)),
    setNoteEffectParam: (trackId, effectId, paramId, value) =>
      edit((project) => setNoteEffectParam(project, trackId, effectId, paramId, value), `fx:${effectId}:${paramId}`),
    setNoteEffectBypassed: (trackId, effectId, bypassed) =>
      edit((project) => setNoteEffectBypassed(project, trackId, effectId, bypassed)),
    setTrackVoices: (trackId, voices) => edit((project) => setTrackVoices(project, trackId, voices)),

    updatePatch: (trackId, change, mergeKey) =>
      edit((project) => editPatchAt(project, { trackId }, change), mergeKey),
    updateModulePatch: (moduleId, change, mergeKey) =>
      edit((project) => editPatchAt(project, { moduleId }, change), mergeKey),
    groupNodes: (target, nodeIds) => edit((project) => groupNodesAsModule(project, target, nodeIds)),
    addModuleUse: (target, moduleId, x, y) => edit((project) => addModuleUse(project, target, moduleId, x, y)),
    unlinkModule: (target, nodeId) => edit((project) => unlinkModuleNode(project, target, nodeId)),
    updateModule: (moduleId, change, mergeKey) => edit((project) => updateModule(project, moduleId, change), mergeKey),
    deleteModule: (moduleId) => edit((project) => removeModule(project, moduleId)),

    createClip: (trackId, scene) => {
      const clip = createClip(`Clip ${scene + 1}`, DEFAULT_CLIP_BEATS)
      edit((project) => setClipAt(project, trackId, scene, clip))
      return clip
    },
    deleteClip: (trackId, scene) => edit((project) => setClipAt(project, trackId, scene, null)),
    setClipNotes: (trackId, clipId, notes) =>
      edit((project) => setClipNotes(project, trackId, clipId, notes)),
    setClipLength: (trackId, clipId, lengthBeats) =>
      edit((project) => setClipLength(project, trackId, clipId, lengthBeats)),
    doubleClip: (trackId, clipId) => edit((project) => doubleClip(project, trackId, clipId)),
  }
})

export const selectTrack = (state: ProjectState, trackId: string | null) =>
  state.project.tracks.find((track) => track.id === trackId)

export const selectCanUndo = (state: ProjectState): boolean => canUndo(state.history)
export const selectCanRedo = (state: ProjectState): boolean => canRedo(state.history)
