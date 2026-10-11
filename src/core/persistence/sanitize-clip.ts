import type { Clip, Note } from '../project'
import { clamp, createId } from '../shared'
import { LIMITS } from './format'
import { type Warn, asList, finiteNumber, isRecord, nonEmptyText } from './raw'

const MIN_NOTE_BEATS = 1 / 16

const sanitizeNote = (raw: unknown, lengthBeats: number): Note | null => {
  if (!isRecord(raw)) return null
  const start = finiteNumber(raw.start, NaN)
  if (Number.isNaN(start) || start < 0 || start >= lengthBeats) return null
  return {
    pitch: Math.round(clamp(finiteNumber(raw.pitch, 60), 0, 127)),
    start,
    duration: clamp(finiteNumber(raw.duration, 0.25), MIN_NOTE_BEATS, lengthBeats),
    velocity: clamp(finiteNumber(raw.velocity, 0.9), 0, 1),
  }
}

/** `usedIds` is shared across a track so clip ids stay unique (clips are launched by id). */
export const sanitizeClip = (
  raw: unknown,
  where: string,
  usedIds: Set<string>,
  warn: Warn,
): Clip | null => {
  if (raw === null || raw === undefined) return null
  if (!isRecord(raw)) {
    warn(`${where}: skipped a malformed clip`)
    return null
  }

  const lengthBeats = clamp(
    finiteNumber(raw.lengthBeats, 4),
    LIMITS.clipBeats.min,
    LIMITS.clipBeats.max,
  )
  const name = nonEmptyText(raw.name, 'Clip', 40)

  const rawNotes = asList(raw.notes)
  if (rawNotes.length > LIMITS.notesPerClip) {
    warn(`${where} / ${name}: only the first ${LIMITS.notesPerClip} notes were kept`)
  }
  const notes = rawNotes
    .slice(0, LIMITS.notesPerClip)
    .map((note) => sanitizeNote(note, lengthBeats))
    .filter((note): note is Note => note !== null)
  const dropped = Math.min(rawNotes.length, LIMITS.notesPerClip) - notes.length
  if (dropped > 0) warn(`${where} / ${name}: dropped ${dropped} invalid note(s)`)

  const id = typeof raw.id === 'string' && !usedIds.has(raw.id) ? raw.id : createId('clip')
  usedIds.add(id)
  return { id, name, lengthBeats, notes }
}
