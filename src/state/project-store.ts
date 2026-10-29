import {
  type Clip,
  type ClipRef,
  type History,
  type ModuleDefinition,
  type Note,
  type Patch,
  type PatchTarget,
  type Project,
  type AudioClipChanges,
  type SampleInfo,
  addArrangementClip,
  addAudioClip,
  addExampleModuleUse,
  addModuleUse,
  addAudioTrackWithClip,
  setAudioClipAt,
  addSamplerTrack,
  addSamples,
  addTrack,
  canRedo,
  canUndo,
  commit,
  createArrangementClip,
  createAudioTrack,
  createClip,
  createReturnTrack,
  createDemoProject,
  createHistory,
  createTrack,
  copySessionClip,
  doubleClip,
  duplicateScene,
  duplicateTrack,
  insertScene,
  removeScene,
  editPatchAt,
  groupNodesAsModule,
  removeModule,
  unlinkModuleNode,
  updateModule,
  redo,
  removeArrangementClip,
  removeSample,
  removeTrack,
  pasteSessionClip,
  setClipAt,
  setClipLength,
  setClipName,
  setClipNotes,
  setSampleName,
  setSceneName,
  setTrackName,
  setProjectName,
  setTempo,
  setMasterVolume,
  setTrackMuted,
  setTrackPan,
  setTrackSoloed,
  setTrackVoices,
  setTrackSend,
  setTrackVolume,
  undo,
  updateArrangementClip,
  updateAudioClip,
  type GroupColour,
  type TrackPlace,
  groupTrack,
  moveGroup,
  moveTrack,
  removeGroup,
  setGroupCollapsed,
  setGroupBus,
  setGroupColour,
  setGroupMuted,
  setGroupSoloed,
  setGroupHidden,
  setGroupName,
  setTrackHidden,
  showAllTracks,
  ungroup,
  withViewOf,
} from '@core'
import { create } from 'zustand'
import type { ArrangementChanges, AudioClip } from '@core'
import { useSelectionStore } from './selection-store'

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
  /** Adds a return track: a place for other tracks to send sound to, with its own effects. */
  addReturnTrack(): void
  removeTrack(trackId: string): void
  /** Adds a copy of a track right after it (see `duplicateTrack`); returns its id, or null at the track limit. */
  duplicateTrack(trackId: string): string | null
  /** Renames a track; an empty name keeps the old one. */
  setTrackName(trackId: string, name: string): void
  /** A new group around a track, in the track's group; returns its id, or null when it can't. */
  groupTrack(trackId: string): string | null
  /** Moves a track or a group; it joins the group of what it lands next to. */
  moveTrack(trackId: string, place: TrackPlace): void
  moveGroup(groupId: string, place: TrackPlace): void
  /** Removes a group and keeps its tracks and nested groups, one level up. */
  ungroup(groupId: string): void
  /** Removes a group, its nested groups and their tracks. */
  removeGroup(groupId: string): void
  setGroupName(groupId: string, name: string): void
  setGroupColour(groupId: string, colour: GroupColour): void
  /** Makes a group sum its tracks into a bus, or back into a folder (dropping the bus's effects). */
  setGroupBus(groupId: string, on: boolean): void
  setGroupMuted(groupId: string, muted: boolean): void
  setGroupSoloed(groupId: string, soloed: boolean): void
  /** View edits: saved with the project, but not undo steps, and undo and redo keep them. */
  setGroupCollapsed(groupId: string, collapsed: boolean): void
  setTrackHidden(trackId: string, hidden: boolean): void
  setGroupHidden(groupId: string, hidden: boolean): void
  showAllTracks(): void
  /** Renames a session clip; an empty name keeps the old one. */
  setClipName(trackId: string, clipId: string, name: string): void
  /** Names a scene; an empty name clears it. */
  setSceneName(scene: number, name: string): void
  /** Inserts an empty scene before `at`, up to 64 scenes. */
  insertScene(at: number): void
  /** Inserts a copy of a scene's row after it, up to 64 scenes. */
  duplicateScene(scene: number): void
  /** Removes a scene's row; the last scene stays. */
  removeScene(scene: number): void
  /** Renames a sample; an empty name keeps the old one. */
  setSampleName(sampleId: string, name: string): void
  setTrackVolume(trackId: string, volume: number): void
  /** Pans a track, -1 (left) .. 1 (right); dragging is one undo step. */
  setTrackPan(trackId: string, pan: number): void
  setTrackMuted(trackId: string, muted: boolean): void
  setTrackSoloed(trackId: string, soloed: boolean): void
  /** The master fader, 0..1; dragging is one undo step. */
  setMasterVolume(volume: number): void
  /** Sets a track's send knob for a return track (0..1); dragging one knob is one undo step. */
  setTrackSend(trackId: string, returnId: string, level: number): void
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
  /**
   * Edits an audio clip, in its slot or a region's copy; rapid edits of the same setting (a slider drag) merge into
   * one undo step.
   */
  updateAudioClip(ref: ClipRef, changes: AudioClipChanges): void
  setTrackVoices(trackId: string, voices: number): void
  /**
   * Applies a pure patch edit (see `@core` patch functions) to a track's instrument.
   * Rapid edits sharing a `mergeKey` (a slider or node drag) collapse into one undo step.
   */
  updatePatch(
    trackId: string,
    edit: (patch: Patch, modules: readonly ModuleDefinition[]) => Patch,
    mergeKey?: string,
  ): void
  /** Like `updatePatch`, for the track's insert graph (the effects after its sound; instrument and audio tracks). */
  updateFx(
    trackId: string,
    edit: (patch: Patch, modules: readonly ModuleDefinition[]) => Patch,
    mergeKey?: string,
  ): void
  /** Like `updatePatch`, for the master bus's graph (the effects on the final mix). */
  updateMasterFx(
    edit: (patch: Patch, modules: readonly ModuleDefinition[]) => Patch,
    mergeKey?: string,
  ): void
  /** Like `updatePatch`, for the track's note graph (what happens to notes before the instrument). */
  updateNoteGraph(
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
  /** Like `updatePatch`, for any patch: a track's graphs, the master's, or a module's inside. */
  editPatch(
    target: PatchTarget,
    edit: (patch: Patch, modules: readonly ModuleDefinition[]) => Patch,
    mergeKey?: string,
  ): void
  /** Replaces the selected nodes of a patch by one use of a new module. */
  groupNodes(target: PatchTarget, nodeIds: readonly string[]): void
  addModuleUse(target: PatchTarget, moduleId: string, x: number, y: number): void
  /** Like `addModuleUse` for an example module: copies its definition into the library first if it is not there (one undo step). */
  addExampleModule(target: PatchTarget, definition: ModuleDefinition, x: number, y: number): void
  /** Turns a use into an independent copy of the module's contents. */
  unlinkModule(target: PatchTarget, nodeId: string): void
  /** Changes a module's definition or interface; every use follows. */
  updateModule(moduleId: string, change: (module: ModuleDefinition) => ModuleDefinition, mergeKey?: string): void
  /** Deletes a module that nothing uses. */
  deleteModule(moduleId: string): void
  createClip(trackId: string, scene: number): Clip
  /** Puts a copy of a clip value into an empty slot of a track of its kind (see `pasteSessionClip`). */
  pasteClip(clip: Clip | AudioClip, trackId: string, scene: number): void
  /**
   * Moves a session clip into an empty slot of a track of its kind, keeping its id (see `copySessionClip`). The
   * selection follows the clip when it is the selected one.
   */
  moveClip(fromTrackId: string, clipId: string, toTrackId: string, scene: number): void
  deleteClip(trackId: string, scene: number): void
  /** Sets a MIDI clip's notes, in its slot or a region's copy. */
  setClipNotes(ref: ClipRef, notes: readonly Note[]): void
  /** Resizes a clip; shortening trims notes that no longer fit. A region grows into the next one, as its edge does. */
  setClipLength(ref: ClipRef, lengthBeats: number): void
  /** Doubles the clip's length and repeats its notes into the new half. */
  doubleClip(ref: ClipRef): void
  /** Puts a copy of a session clip on the arrangement timeline of one track. */
  addArrangementClip(trackId: string, startBeat: number, content: Clip | AudioClip): void
  /** Moves or resizes an arrangement region; a drag merges into one undo step. A selected region keeps its selection. */
  updateArrangementClip(id: string, changes: ArrangementChanges, mergeKey?: string): void
  removeArrangementClip(id: string): void
}

export interface ProjectState extends ProjectActions {
  /** Changes only when loading/replacing the document; transient owners must release. */
  readonly documentEpoch: number
  /** The current project; always equal to `history.present`. */
  readonly project: Project
  readonly history: History<Project>
}

const demo = createDemoProject()

/** The document: the single source of truth for everything the user authors, with undo/redo. */
export const useProjectStore = create<ProjectState>((set, get) => {
  const withHistory = (history: History<Project>) => ({ history, project: history.present })

  const edit = (change: (project: Project) => Project, mergeKey?: string) =>
    set((state) => {
      const history = commit(state.history, change(state.project), {
        key: mergeKey,
        now: Date.now(),
      })
      return history === state.history ? state : withHistory(history)
    })

  /** A view edit replaces the present without an undo step (see `withViewOf`). */
  const editView = (change: (project: Project) => Project) =>
    set((state) => {
      const project = change(state.project)
      return project === state.project ? state : { history: { ...state.history, present: project }, project }
    })

  /** After undo or redo: the restored project, showing what the current one shows. */
  const restored = (state: ProjectState, history: History<Project>) => {
    const present = withViewOf(history.present, state.project)
    return withHistory(present === history.present ? history : { ...history, present })
  }

  return {
    documentEpoch: 0,
    project: demo,
    history: createHistory(demo),

    resetProject: (project) => set({ ...withHistory(createHistory(project)), documentEpoch: get().documentEpoch + 1 }),
    replaceProject: (project) => set((state) => ({
      ...withHistory(commit(state.history, project, { now: Date.now() })),
      documentEpoch: state.documentEpoch + 1,
    })),
    undo: () => set((state) => restored(state, undo(state.history))),
    redo: () => set((state) => restored(state, redo(state.history))),

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
    addReturnTrack: () =>
      edit((project) => {
        const count = project.tracks.filter((track) => track.kind === 'return').length
        return addTrack(project, createReturnTrack(`Return ${String.fromCharCode(65 + (count % 26))}`))
      }),
    removeTrack: (trackId) => edit((project) => removeTrack(project, trackId)),
    duplicateTrack: (trackId) => {
      const result = duplicateTrack(get().project, trackId)
      if (result.trackId) edit(() => result.project)
      return result.trackId
    },
    setTrackName: (trackId, name) => edit((project) => setTrackName(project, trackId, name)),
    groupTrack: (trackId) => {
      const result = groupTrack(get().project, trackId)
      if (result.groupId) edit(() => result.project)
      return result.groupId
    },
    moveTrack: (trackId, place) => edit((project) => moveTrack(project, trackId, place)),
    moveGroup: (groupId, place) => edit((project) => moveGroup(project, groupId, place)),
    ungroup: (groupId) => edit((project) => ungroup(project, groupId)),
    removeGroup: (groupId) => edit((project) => removeGroup(project, groupId)),
    setGroupName: (groupId, name) => edit((project) => setGroupName(project, groupId, name)),
    setGroupColour: (groupId, colour) => edit((project) => setGroupColour(project, groupId, colour)),
    setGroupBus: (groupId, on) => edit((project) => setGroupBus(project, groupId, on)),
    setGroupMuted: (groupId, muted) => edit((project) => setGroupMuted(project, groupId, muted)),
    setGroupSoloed: (groupId, soloed) => edit((project) => setGroupSoloed(project, groupId, soloed)),
    setGroupCollapsed: (groupId, collapsed) => editView((project) => setGroupCollapsed(project, groupId, collapsed)),
    setTrackHidden: (trackId, hidden) => editView((project) => setTrackHidden(project, trackId, hidden)),
    setGroupHidden: (groupId, hidden) => editView((project) => setGroupHidden(project, groupId, hidden)),
    showAllTracks: () => editView(showAllTracks),
    setClipName: (trackId, clipId, name) => edit((project) => setClipName(project, trackId, clipId, name)),
    setSceneName: (scene, name) => edit((project) => setSceneName(project, scene, name)),
    insertScene: (at) => edit((project) => insertScene(project, at)),
    duplicateScene: (scene) => edit((project) => duplicateScene(project, scene)),
    removeScene: (scene) => edit((project) => removeScene(project, scene)),
    setSampleName: (sampleId, name) => edit((project) => setSampleName(project, sampleId, name)),
    setTrackVolume: (trackId, volume) =>
      edit((project) => setTrackVolume(project, trackId, volume), `volume:${trackId}`),

    setTrackPan: (trackId, pan) => edit((project) => setTrackPan(project, trackId, pan), `pan:${trackId}`),
    setTrackMuted: (trackId, muted) => edit((project) => setTrackMuted(project, trackId, muted)),
    setTrackSoloed: (trackId, soloed) => edit((project) => setTrackSoloed(project, trackId, soloed)),
    setMasterVolume: (volume) => edit((project) => setMasterVolume(project, volume), 'master-volume'),

    setTrackSend: (trackId, returnId, level) =>
      edit((project) => setTrackSend(project, trackId, returnId, level), `send:${trackId}:${returnId}`),

    addSamples: (samples) => edit((project) => addSamples(project, samples)),
    removeSample: (sampleId) => edit((project) => removeSample(project, sampleId)),
    addSamplerTrack: (sample) => edit((project) => addSamplerTrack(project, sample)),
    addAudioTrackFromSample: (sample) => edit((project) => addAudioTrackWithClip(project, sample)),
    deleteAudioClip: (trackId, scene) => edit((project) => setAudioClipAt(project, trackId, scene, null)),
    createAudioClip: (trackId, scene, sample) =>
      edit((project) => addAudioClip(project, trackId, scene, sample)),
    updateAudioClip: (ref, changes) =>
      edit(
        (project) => updateAudioClip(project, ref, changes),
        `audio:${ref.kind === 'region' ? ref.regionId : ref.clipId}:${Object.keys(changes).sort().join(',')}`,
      ),
    setTrackVoices: (trackId, voices) => edit((project) => setTrackVoices(project, trackId, voices)),

    updatePatch: (trackId, change, mergeKey) =>
      edit((project) => editPatchAt(project, { trackId }, change), mergeKey),
    updateFx: (trackId, change, mergeKey) =>
      edit((project) => editPatchAt(project, { trackId, graph: 'fx' }, change), mergeKey),
    updateMasterFx: (change, mergeKey) =>
      edit((project) => editPatchAt(project, { master: true }, change), mergeKey),
    updateNoteGraph: (trackId, change, mergeKey) =>
      edit((project) => editPatchAt(project, { trackId, graph: 'notes' }, change), mergeKey),
    updateModulePatch: (moduleId, change, mergeKey) =>
      edit((project) => editPatchAt(project, { moduleId }, change), mergeKey),
    editPatch: (target, change, mergeKey) => edit((project) => editPatchAt(project, target, change), mergeKey),
    groupNodes: (target, nodeIds) => edit((project) => groupNodesAsModule(project, target, nodeIds)),
    addModuleUse: (target, moduleId, x, y) => edit((project) => addModuleUse(project, target, moduleId, x, y)),
    addExampleModule: (target, definition, x, y) => edit((project) => addExampleModuleUse(project, target, definition, x, y)),
    unlinkModule: (target, nodeId) => edit((project) => unlinkModuleNode(project, target, nodeId)),
    updateModule: (moduleId, change, mergeKey) => edit((project) => updateModule(project, moduleId, change), mergeKey),
    deleteModule: (moduleId) => edit((project) => removeModule(project, moduleId)),

    createClip: (trackId, scene) => {
      const clip = createClip(`Clip ${scene + 1}`, DEFAULT_CLIP_BEATS)
      edit((project) => setClipAt(project, trackId, scene, clip))
      return clip
    },
    moveClip: (fromTrackId, clipId, toTrackId, scene) => {
      const before = get().project
      edit((project) => copySessionClip(project, fromTrackId, clipId, toTrackId, scene, true))
      const selection = useSelectionStore.getState()
      if (get().project !== before && selection.clipId === clipId) selection.selectClip(toTrackId, clipId)
    },
    deleteClip: (trackId, scene) => edit((project) => setClipAt(project, trackId, scene, null)),
    pasteClip: (clip, trackId, scene) => edit((project) => pasteSessionClip(project, clip, trackId, scene)),
    setClipNotes: (ref, notes) => edit((project) => setClipNotes(project, ref, notes)),
    setClipLength: (ref, lengthBeats) => edit((project) => setClipLength(project, ref, lengthBeats)),
    doubleClip: (ref) => edit((project) => doubleClip(project, ref)),

    addArrangementClip: (trackId, startBeat, content) =>
      edit((project) => ({
        ...project,
        arrangement: addArrangementClip(project.arrangement ?? [], createArrangementClip(trackId, startBeat, content)),
      })),
    updateArrangementClip: (id, changes, mergeKey) => {
      edit((project) => {
        const arrangement = updateArrangementClip(project.arrangement ?? [], id, changes)
        return arrangement === (project.arrangement ?? []) ? project : { ...project, arrangement }
      }, mergeKey)
      // A selected region moved to another lane stays selected, with its new track.
      const selection = useSelectionStore.getState()
      if (changes.trackId && selection.regionId === id && selection.trackId !== changes.trackId) selection.selectRegion(id, changes.trackId)
    },
    removeArrangementClip: (id) =>
      edit((project) => ({ ...project, arrangement: removeArrangementClip(project.arrangement ?? [], id) })),
  }
})

export const selectTrack = (state: ProjectState, trackId: string | null) =>
  state.project.tracks.find((track) => track.id === trackId)

export const selectCanUndo = (state: ProjectState): boolean => canUndo(state.history)
export const selectCanRedo = (state: ProjectState): boolean => canRedo(state.history)
