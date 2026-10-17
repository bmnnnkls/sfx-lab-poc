import { CURRENT_VERSION } from './format'
import { isRecord } from './raw'

type Migration = (project: unknown) => unknown

/** `MIGRATIONS[n]` upgrades the `project` payload from format version n to n + 1. */
const MIGRATIONS: Readonly<Record<number, Migration>> = {
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
