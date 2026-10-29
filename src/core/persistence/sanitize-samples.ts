import { NAME_LIMITS } from '../project'
import { SAMPLE_MARK_LIMITS, type SampleInfo, type SampleMarker, type SampleRegion, savedFrameCount } from '../sample'
import { clamp } from '../shared'
import { LIMITS } from './format'
import { type Warn, asList, finiteNumber, isRecord, nonEmptyText } from './raw'

const SAMPLE_ID = /^[0-9a-f]{64}$/
const EXTENSION = /^[a-z0-9]{1,5}$/

const MARK_ID = /^[\w-]{1,64}$/

const frameIn = (value: unknown, frames: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= frames

const markName = (value: unknown): value is string => typeof value === 'string' && value.length <= SAMPLE_MARK_LIMITS.name

/**
 * Keeps the well-formed entries of a marker or region list: unique ids, whole frames inside the sample, names of at most
 * `SAMPLE_MARK_LIMITS.name` characters, at most `limit` of them. Undefined when the file has no such list.
 */
const sanitizeMarks = <T extends { readonly id: string }>(
  raw: unknown,
  limit: number,
  keep: (entry: Record<string, unknown>) => T | null,
  what: string,
  sample: string,
  warn: Warn,
): T[] | undefined => {
  if (raw === undefined) return undefined
  const list = asList(raw)
  if (list.length > limit) warn(`Only the first ${limit} ${what}s of "${sample}" were kept`)
  const seen = new Set<string>()
  const kept: T[] = []
  let dropped = Array.isArray(raw) ? 0 : 1
  for (const entry of list.slice(0, limit)) {
    const mark = isRecord(entry) && typeof entry.id === 'string' && MARK_ID.test(entry.id) && !seen.has(entry.id) ? keep(entry) : null
    if (!mark) {
      dropped++
      continue
    }
    seen.add(mark.id)
    kept.push(mark)
  }
  if (dropped > 0) warn(`Dropped ${dropped} invalid ${what}${dropped === 1 ? '' : 's'} of "${sample}"`)
  return kept
}

/** Sample ids are SHA-256 hashes; anything else cannot match stored audio and is dropped. */
export const sanitizeSamples = (raw: unknown, warn: Warn): SampleInfo[] => {
  const list = asList(raw)
  if (list.length > LIMITS.samples) warn(`Only the first ${LIMITS.samples} samples were kept`)

  const seen = new Set<string>()
  const samples: SampleInfo[] = []
  let skipped = 0

  for (const entry of list.slice(0, LIMITS.samples)) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !SAMPLE_ID.test(entry.id) || seen.has(entry.id)) {
      skipped++
      continue
    }
    seen.add(entry.id)
    const extension = typeof entry.extension === 'string' ? entry.extension.toLowerCase() : ''
    const info: SampleInfo = {
      id: entry.id,
      name: nonEmptyText(entry.name, 'Sample', NAME_LIMITS.sample),
      extension: EXTENSION.test(extension) ? extension : 'bin',
      durationSeconds: Math.max(0, finiteNumber(entry.durationSeconds, 0)),
      sampleRate: clamp(finiteNumber(entry.sampleRate, 44100), 8000, 192000),
      channels: Math.round(clamp(finiteNumber(entry.channels, 1), 1, 8)),
      bytes: Math.max(0, finiteNumber(entry.bytes, 0)),
    }
    const frames = savedFrameCount(info)
    if (entry.origin !== undefined && (typeof entry.origin !== 'string' || !SAMPLE_ID.test(entry.origin))) warn(`Dropped the invalid origin of "${info.name}"`)
    const origin = typeof entry.origin === 'string' && SAMPLE_ID.test(entry.origin) ? entry.origin : undefined
    const markers = sanitizeMarks<SampleMarker>(entry.markers, SAMPLE_MARK_LIMITS.markers, (mark) =>
      frameIn(mark.frame, frames) && markName(mark.name) ? { id: mark.id as string, frame: mark.frame, name: mark.name } : null, 'marker', info.name, warn)
    const regions = sanitizeMarks<SampleRegion>(entry.regions, SAMPLE_MARK_LIMITS.regions, (mark) =>
      frameIn(mark.from, frames) && frameIn(mark.to, frames) && mark.from < mark.to && markName(mark.name)
        ? { id: mark.id as string, from: mark.from, to: mark.to, name: mark.name }
        : null, 'region', info.name, warn)
    samples.push({ ...info, ...(origin !== undefined && { origin }), ...(markers && { markers }), ...(regions && { regions }) })
  }
  if (skipped > 0) warn(`Skipped ${skipped} invalid sample entr${skipped === 1 ? 'y' : 'ies'}`)
  return samples
}
