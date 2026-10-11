export type { Clip, Note, Project, Track } from './types'
export {
  MAX_TEMPO,
  MIN_TEMPO,
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
