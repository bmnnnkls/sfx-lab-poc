import { automationOwnerKey } from '../automation'
import type { ControlOwner } from '../control'
import { MAX_TIMELINE_BEATS, type Project, type TimelineLanes } from '../project'
import { isRecord, type Warn } from './raw'
import { sanitizeAutomation } from './sanitize-automation'
import { readControlOwner } from './sanitize-control-values'

/** At most one entry per possible owner: every track, every group and the master. */
const MAX_ENTRIES = 512

const ownerName = (owner: ControlOwner) => (owner.kind === 'master' ? 'the master' : owner.kind === 'group' ? `group "${owner.groupId}"` : `track "${owner.trackId}"`)

/**
 * The timeline's automation lanes (format v14). An entry whose owner doesn't exist is dropped; a group's entry is kept
 * while the group exists, with or without its bus, so switching the bus back on brings its lanes back. Lanes are read
 * as clip lanes are, over the timeline's length, and a lane naming another owner warns and is kept unavailable.
 * Each repair warns.
 */
export const sanitizeTimelineAutomation = (raw: unknown, project: Pick<Project, 'tracks' | 'groups'>, warn: Warn): readonly TimelineLanes[] | undefined => {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw)) { warn('Invalid timeline automation dropped'); return undefined }
  const exists = (owner: ControlOwner) =>
    owner.kind === 'master' || (owner.kind === 'group' ? !!project.groups?.some((group) => group.id === owner.groupId) : project.tracks.some((track) => track.id === owner.trackId))
  const seen = new Set<string>()
  const entries: TimelineLanes[] = []
  for (const entry of raw.slice(0, MAX_ENTRIES)) {
    const owner = isRecord(entry) ? readControlOwner(entry.owner) : undefined
    if (!isRecord(entry) || !owner) { warn('Invalid timeline automation entry skipped'); continue }
    if (!exists(owner)) { warn(`Timeline automation of a missing owner (${ownerName(owner)}) dropped`); continue }
    const key = automationOwnerKey(owner)
    if (seen.has(key)) { warn(`Duplicate timeline automation of ${ownerName(owner)} skipped`); continue }
    seen.add(key)
    const instrument = owner.kind === 'track' && project.tracks.find((track) => track.id === owner.trackId)?.kind === 'instrument'
    const lanes = sanitizeAutomation(entry.lanes ?? [], MAX_TIMELINE_BEATS, warn, owner, instrument) ?? []
    const open = entry.open === true
    if (!lanes.length && !open) continue
    entries.push({ owner, lanes, ...(open && { open: true }) })
  }
  if (raw.length > MAX_ENTRIES) warn('Timeline automation entry limit exceeded')
  return entries.length ? entries : undefined
}
