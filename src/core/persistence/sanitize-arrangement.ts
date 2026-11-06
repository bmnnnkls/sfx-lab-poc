import {
  type ArrangementClip,
  type ArrangementLoop,
  type ArrangementMarker,
  MAX_ARRANGEMENT_MARKERS,
  MAX_NAME_LENGTH,
  MAX_TIMELINE_BEATS,
  MIN_LOOP_BEATS,
  createMarkerId,
  loopRangeOf,
} from '../project'
import { createId } from '../shared'
import { sanitizeAudioClip } from './sanitize-audio-clip'
import { sanitizeClip } from './sanitize-clip'
import { type Warn, asList, finiteNumber, isRecord } from './raw'
import { LIMITS } from './format'

/**
 * The arrangement: copies of session clips placed on a timeline. A region is only meaningful when its
 * track still exists and its sample is in the library, so broken ones are dropped (and reported).
 */
export const sanitizeArrangement = (
  raw: unknown,
  trackIds: ReadonlySet<string>,
  sampleIds: ReadonlySet<string>,
  warn: Warn,
): ArrangementClip[] | undefined => {
  const entries = asList(raw)
  if (entries.length === 0 && raw === undefined) return undefined
  const usedIds = new Set<string>()
  const clips: ArrangementClip[] = []
  let dropped = 0
  let late = 0
  for (const entry of entries.slice(0, LIMITS.arrangementClips)) {
    if (!isRecord(entry) || typeof entry.trackId !== 'string' || !trackIds.has(entry.trackId)) {
      dropped++
      continue
    }
    const content =
      isRecord(entry.content) && 'sampleId' in entry.content
        ? sanitizeAudioClip(entry.content, 'the arrangement', sampleIds, usedIds, warn, { kind: 'track', trackId: entry.trackId })
        : sanitizeClip(entry.content, 'the arrangement', usedIds, warn, { kind: 'track', trackId: entry.trackId })
    if (!content) {
      dropped++
      continue
    }
    const startBeat = finiteNumber(entry.startBeat, NaN)
    if (Number.isNaN(startBeat) || startBeat < 0) {
      dropped++
      continue
    }
    if (startBeat + content.lengthBeats > MAX_TIMELINE_BEATS) {
      late++
      continue
    }
    const id = typeof entry.id === 'string' && !usedIds.has(entry.id) ? entry.id : createId('arr')
    usedIds.add(id)
    clips.push({ id, trackId: entry.trackId, startBeat, content, ...(entry.loop === true && { loop: true }) })
  }
  if (late > 0) warn(`The arrangement dropped ${late} clip(s) that end past beat ${MAX_TIMELINE_BEATS}, the end of the timeline`)
  if (entries.length > LIMITS.arrangementClips) warn(`Only the first ${LIMITS.arrangementClips} arrangement clips were kept`)
  if (dropped > 0) warn(`The arrangement dropped ${dropped} clip(s) whose track or sample is missing`)
  return clips.length > 0 ? clips : undefined
}

const inTimeline = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_TIMELINE_BEATS

/**
 * The arrangement's markers and loop brace. A marker needs a beat inside the timeline; a duplicate or missing id gets a
 * fresh one, the name is trimmed (a missing one becomes *Marker N*), and the first `MAX_ARRANGEMENT_MARKERS` by beat
 * are kept. A loop needs two beats inside the timeline; its ends are put in order and a short one is stretched to
 * `MIN_LOOP_BEATS`. It is on only when `enabled` is a real `true`. Each repair warns.
 */
export const sanitizeArrangementMarks = (
  rawMarkers: unknown,
  rawLoop: unknown,
  warn: Warn,
): { markers?: ArrangementMarker[]; loop?: ArrangementLoop } => {
  const usedIds = new Set<string>()
  const markers: ArrangementMarker[] = []
  let dropped = 0
  let renamed = 0
  for (const entry of asList(rawMarkers)) {
    if (!isRecord(entry) || !inTimeline(entry.beat)) {
      dropped++
      continue
    }
    const id = typeof entry.id === 'string' && entry.id !== '' && !usedIds.has(entry.id) ? entry.id : createMarkerId()
    if (id !== entry.id) renamed++
    usedIds.add(id)
    const name = typeof entry.name === 'string' ? entry.name.trim().slice(0, MAX_NAME_LENGTH) : ''
    markers.push({ id, beat: entry.beat, name: name || `Marker ${markers.length + 1}` })
  }
  markers.sort((a, b) => a.beat - b.beat)
  if (dropped > 0) warn(`The arrangement dropped ${dropped} marker(s) outside the timeline`)
  if (renamed > 0) warn(`The arrangement gave ${renamed} marker(s) with a missing or duplicate id a new one`)
  if (markers.length > MAX_ARRANGEMENT_MARKERS) warn(`Only the first ${MAX_ARRANGEMENT_MARKERS} arrangement markers were kept`)
  const kept = markers.slice(0, MAX_ARRANGEMENT_MARKERS)

  let loop: ArrangementLoop | undefined
  if (rawLoop !== undefined) {
    if (!isRecord(rawLoop) || !inTimeline(rawLoop.from) || !inTimeline(rawLoop.to)) {
      warn('The arrangement dropped a loop outside the timeline')
    } else {
      const range = loopRangeOf({ from: rawLoop.from, to: rawLoop.to })
      if (range.from !== rawLoop.from || range.to !== rawLoop.to) warn(`The arrangement's loop was put in order and made at least ${MIN_LOOP_BEATS} beat long`)
      loop = { ...range, ...(rawLoop.enabled === true && { enabled: true }) }
    }
  }
  return { ...(kept.length > 0 && { markers: kept }), ...(loop && { loop }) }
}
