export type { Clip, Note, Project, Track } from './types'
export {
  DEFAULT_SCENE_COUNT,
  DEFAULT_VOICES,
  MAX_NAME_LENGTH,
  MAX_VOICES,
  MIN_VOICES,
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
  setTrackVoices,
  setTrackVolume,
} from './edit'
export { createDemoProject } from './demo-project'
