import { NAME_LIMITS } from '../project'
import { type RemapStep, SAMPLE_MARK_LIMITS, type SampleInfo, type SampleLineage, type SampleLoop, type SampleMarker, type SampleRegion, savedFrameCount } from '../sample'
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

const wholeAtLeast = (value: unknown, min: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= min

/** A step of a sample of `frames` frames when its numbers lie inside it, with the length after it. */
const stepIn = (raw: unknown, frames: number): { step: RemapStep; frames: number } | null => {
  if (!isRecord(raw) || !frameIn(raw.from, frames) || !frameIn(raw.to, frames) || raw.from > raw.to) return null
  const [from, to] = [raw.from, raw.to]
  if (raw.kind === 'splice' && wholeAtLeast(raw.inserted, 0)) return { step: { kind: 'splice', from, to, inserted: raw.inserted }, frames: frames - (to - from) + raw.inserted }
  if (raw.kind === 'crop' && from < to) return { step: { kind: 'crop', from, to }, frames: to - from }
  if (raw.kind === 'mirror') return { step: { kind: 'mirror', from, to }, frames }
  return null
}

/**
 * A sample's lineage when it is whole: the original's facts, and steps that each fit the length the one before left,
 * ending at the sample's own length. Anything else is dropped as a whole (the sample then can't revert).
 */
const sanitizeLineage = (raw: unknown, frames: number): SampleLineage | null => {
  if (!isRecord(raw) || !isRecord(raw.original) || !Array.isArray(raw.steps)) return null
  const original = raw.original
  const extension = typeof original.extension === 'string' ? original.extension : ''
  const { bytes, channels, durationSeconds, sampleRate } = original
  if (!EXTENSION.test(extension) || !wholeAtLeast(bytes, 0) || !wholeAtLeast(channels, 1) || channels > 8) return null
  if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds) || durationSeconds < 0) return null
  if (typeof sampleRate !== 'number' || !Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) return null
  let length = savedFrameCount({ durationSeconds, sampleRate })
  const steps: RemapStep[] = []
  for (const entry of raw.steps) {
    const next = stepIn(entry, length)
    if (!next) return null
    steps.push(next.step)
    length = next.frames
  }
  return length === frames ? { original: { extension, bytes, channels, durationSeconds, sampleRate }, steps } : null
}

/** A loop's frames, whole and clamped to the sample; null when nothing is left. */
const sanitizeLoop = (raw: unknown, frames: number): SampleLoop | null => {
  if (!isRecord(raw) || typeof raw.from !== 'number' || typeof raw.to !== 'number' || !Number.isFinite(raw.from) || !Number.isFinite(raw.to)) return null
  const [from, to] = [clamp(Math.round(raw.from), 0, frames), clamp(Math.round(raw.to), 0, frames)]
  return to > from ? { from, to } : null
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
    const loop = entry.loop === undefined ? undefined : sanitizeLoop(entry.loop, frames)
    if (loop === null) warn(`Dropped the invalid loop of "${info.name}"`)
    // A lineage needs an origin: it is the way back to it.
    const lineage = entry.lineage === undefined ? undefined : origin === undefined ? null : sanitizeLineage(entry.lineage, frames)
    if (lineage === null) warn(`Dropped the invalid edit history of "${info.name}"; it can't be reverted`)
    samples.push({
      ...info,
      ...(origin !== undefined && { origin }),
      ...(markers && { markers }),
      ...(regions && { regions }),
      ...(loop && { loop }),
      ...(lineage && { lineage }),
    })
  }
  if (skipped > 0) warn(`Skipped ${skipped} invalid sample entr${skipped === 1 ? 'y' : 'ies'}`)
  return samples
}
