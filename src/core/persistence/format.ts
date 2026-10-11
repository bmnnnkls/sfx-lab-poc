import { MAX_PANEL_CONTROLS } from '../patch'

/** Identifies our files so the importer can reject anything else with a clear message. */
export const FORMAT = 'sfx-lab-project'

/** Bump when the saved shape changes, and add a step to `migrations.ts`. */
export const CURRENT_VERSION = 1

/** Hard caps so a malformed or hostile file cannot make the app allocate without bound. */
export const LIMITS = {
  tracks: 64,
  scenes: 64,
  samples: 256,
  modules: 128,
  portsPerModule: 64,
  nodesPerPatch: 200,
  controlsPerPatch: MAX_PANEL_CONTROLS,
  notesPerClip: 5000,
  clipBeats: { min: 0.25, max: 256 },
} as const
