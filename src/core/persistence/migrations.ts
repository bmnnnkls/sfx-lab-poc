import { CURRENT_VERSION } from './format'
import { isRecord } from './raw'

type Migration = (project: unknown) => unknown

/** `MIGRATIONS[n]` upgrades the `project` payload from format version n to n + 1. */
const MIGRATIONS: Readonly<Record<number, Migration>> = {
  4: (project) => {
    if (!isRecord(project)) return project
    const strip = (raw: unknown) => { if (!isRecord(raw)) return raw; const { automationSlots: _unknown, ...saved } = raw; return saved }
    return { ...project, master: strip(project.master), tracks: Array.isArray(project.tracks) ? project.tracks.map(strip) : project.tracks }
  },
  3: (project) => {
    if (!isRecord(project) || !Array.isArray(project.tracks)) return project
    return { ...project, tracks: project.tracks.map((track) => !isRecord(track) || !Array.isArray(track.clips) ? track : { ...track, clips: track.clips.map((clip) => {
      if (!isRecord(clip)) return clip
      const { automation: _unknown, ...authored } = clip
      return authored
    }) }) }
  },
  2: (project) => {
    if (!isRecord(project)) return project
    const { midiMappings: _unknown, ...authored } = project
    return authored
  },
  // v1 never interpreted controlValues. Do not reinterpret an unknown old field as v2 data.
  1: (project) => {
    if (!isRecord(project)) return project
    const { controlValues: _unknown, ...authored } = project
    return authored
  },
}

export const migrate = (project: unknown, fromVersion: number): unknown => {
  let data = project
  for (let version = fromVersion; version < CURRENT_VERSION; version++) {
    const step = MIGRATIONS[version]
    if (!step) throw new Error(`No migration from format version ${version}`)
    data = step(data)
  }
  return data
}
