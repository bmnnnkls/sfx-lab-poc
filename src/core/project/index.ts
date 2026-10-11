export type { Clip, Note, Project, Track } from './types'
export {
  DEFAULT_SCENE_COUNT,
  MAX_NAME_LENGTH,
  MAX_TEMPO,
  MIN_TEMPO,
  createEmptyProject,
  setProjectName,
  addTrack,
  createClip,
  createTrack,
  removeTrack,
  setClipAt,
  setClipNotes,
  setTempo,
  setTrackPatch,
  setTrackVolume,
} from './edit'
export { createDemoProject } from './demo-project'
