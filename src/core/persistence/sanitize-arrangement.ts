import { type ArrangementClip, MAX_TIMELINE_BEATS } from '../project'
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
        ? sanitizeAudioClip(entry.content, 'the arrangement', sampleIds, usedIds, warn)
        : sanitizeClip(entry.content, 'the arrangement', usedIds, warn)
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
