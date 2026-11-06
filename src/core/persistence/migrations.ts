import { CURRENT_VERSION } from './format'
import { isRecord } from './raw'

type Migration = (project: unknown) => unknown

/** `MIGRATIONS[n]` upgrades the `project` payload from format version n to n + 1. */
const MIGRATIONS: Readonly<Record<number, Migration>> = {
  // v15 adds pitch bend, pressure and CC as lane targets on instrument tracks; a v14 file has none.
  14: (project) => project,
  // v14 adds the arrangement's timeline automation lanes, optional; a v13 file has none.
  13: (project) => project,
  // v13 adds the arrangement's markers and loop brace, both optional; a v12 file has neither.
  12: (project) => project,
  // v12 adds a sample's loop and lineage, both optional; a v11 sample has neither, so it plays as before and can't revert.
  11: (project) => project,
  // v11 adds a sample's origin, markers and regions, all optional; a v10 file has none.
  10: (project) => project,
  // v10 adds track groups and hidden tracks. v9 never interpreted them.
  9: (project) => {
    if (!isRecord(project)) return project
    const { groups: _unknown, ...authored } = project
    const strip = (raw: unknown) => { if (!isRecord(raw)) return raw; const { groupId: _group, hidden: _hidden, ...saved } = raw; return saved }
    return Array.isArray(authored.tracks) ? { ...authored, tracks: authored.tracks.map(strip) } : authored
  },
  // v9 uses deterministic signatures; sanitation reconstructs them from preserved revision payloads.
  // Opaque revision IDs and preset references are unchanged.
  8: (project) => project,
  // v7 did not interpret division. Walk graphs inside tracks, modules and saved revisions too.
  7: (project) => {
    if (!isRecord(project)) return project
    const copy = JSON.parse(JSON.stringify(project)) as Record<string, unknown>
    const pending: unknown[] = [copy]
    while (pending.length) {
      const value = pending.pop()
      if (Array.isArray(value)) { for (const child of value) pending.push(child); continue }
      if (!isRecord(value)) continue
      if ((value.type === 'delay' || value.type === 'pingPong') && isRecord(value.params)) delete value.params.division
      // Old unknown references must not acquire a newly introduced control.
      for (const [key, child] of Object.entries(value)) {
        if (Array.isArray(child)) value[key] = child.filter(entry => !(isRecord(entry) && isRecord(entry.target) && ['delay', 'pingPong'].includes(String(entry.target.nodeType)) && entry.target.paramId === 'division'))
        pending.push(value[key])
      }
    }
    return copy
  },
  6: (project) => {
    if (!isRecord(project)) return project
    const { libraryOrigins: _unknown, ...authored } = project
    return authored
  },
  5: (project) => {
    if (!isRecord(project)) return project
    const { snapshots: _snapshots, sampleBindings: _samples, assetRevisions: _assets, presets: _presets, ...authored } = project
    return authored
  },
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
