import type { LibraryCatalog } from '../library'
import { sanitizePresetFields } from './sanitize-presets'
import { sanitizeSamples } from './sanitize-samples'
import { sanitizeClip } from './sanitize-clip'
import { sanitizeAudioClip } from './sanitize-audio-clip'
import { sanitizeAutomation } from './sanitize-automation'

/** Compare reconstructed known fields, independent of JSON object key order. No repair on bundle import. */
export const canonicalRecord = (value: unknown): string => JSON.stringify(value, (_key, v: unknown) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : v)
export const validateLibraryPayloads = (catalog: LibraryCatalog): void => {
  const fail = (message: string): never => { throw new Error(`Invalid library record: ${message}`) }
  const same = (a: unknown, b: unknown) => { if (canonicalRecord(a) !== canonicalRecord(b)) fail('fields, limits or references require repair') }
  const ids = new Set(catalog.samples.map(s => s.id))
  for (const sample of catalog.samples) same([sample], sanitizeSamples([sample], fail))
  for (const revision of catalog.revisions) {
    const parsed = sanitizePresetFields({ assetRevisions: [revision] }, ids, fail)
    same(revision, parsed.assetRevisions?.[0])
  }
  for (const item of catalog.items) {
    const c = item.content
    if ('state' in c) {
      same(c.state, sanitizePresetFields({ presets: [c.state] }, ids, fail).presets?.[0])
    } else if (c.kind === 'midi-clip' || c.kind === 'audio-clip') {
      if ('automation' in c.clip) fail('portable clip automation must use owner-relative lanes')
      same(c.clip, c.kind === 'midi-clip' ? sanitizeClip(c.clip, item.name, new Set(), fail) : sanitizeAudioClip(c.clip, item.name, ids, new Set(), fail))
      const owner = { kind: 'track', trackId: 'bundle-validation' }
      const lanes = c.lanes.map(l => ({ id: l.id, enabled: l.enabled, points: l.points, target: { ...l.target, owner } }))
      same(lanes, sanitizeAutomation(lanes, c.clip.lengthBeats, fail) ?? [])
    }
  }
}
