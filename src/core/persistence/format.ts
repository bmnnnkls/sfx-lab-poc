import { MAX_GROUPS, MAX_PATCH_NODES, MAX_PINS, MAX_SCENES, MAX_TRACKS } from '../project'

/** Identifies our files so the importer can reject anything else with a clear message. */
export const FORMAT = 'sfx-lab-project'

/** Bump when the saved shape changes, and add a step to `migrations.ts`. */
export const CURRENT_VERSION = 13

/** Hard caps so a malformed or hostile file cannot make the app allocate without bound. */
export const LIMITS = {
  tracks: MAX_TRACKS,
  groups: MAX_GROUPS,
  pins: MAX_PINS,
  scenes: MAX_SCENES,
  samples: 256,
  modules: 128,
  portsPerModule: 64,
  nodesPerPatch: MAX_PATCH_NODES,
  notesPerClip: 5000,
  arrangementClips: 2000,
  clipBeats: { min: 0.25, max: 256 },
} as const
