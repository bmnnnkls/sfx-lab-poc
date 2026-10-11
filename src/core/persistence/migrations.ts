import { CURRENT_VERSION } from './format'

type Migration = (project: unknown) => unknown

/** `MIGRATIONS[n]` upgrades the `project` payload from format version n to n + 1. */
const MIGRATIONS: Readonly<Record<number, Migration>> = {}

export const migrate = (project: unknown, fromVersion: number): unknown => {
  let data = project
  for (let version = fromVersion; version < CURRENT_VERSION; version++) {
    const step = MIGRATIONS[version]
    if (!step) throw new Error(`No migration from format version ${version}`)
    data = step(data)
  }
  return data
}
