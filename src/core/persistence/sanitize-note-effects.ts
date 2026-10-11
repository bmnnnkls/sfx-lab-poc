import { type NoteEffect, findNoteEffect } from '../notefx'
import { MAX_NOTE_EFFECTS } from '../project'
import { clamp, createId } from '../shared'
import { type Warn, asList, finiteNumber, isRecord } from './raw'

/** A track's MIDI effect chain from untrusted data: unknown types are skipped, parameters clamped to their ranges. */
export const sanitizeNoteEffects = (raw: unknown, where: string, warn: Warn): NoteEffect[] => {
  const list = asList(raw)
  if (list.length > MAX_NOTE_EFFECTS) warn(`${where}: only the first ${MAX_NOTE_EFFECTS} MIDI effects were kept`)

  const usedIds = new Set<string>()
  const effects: NoteEffect[] = []
  for (const item of list.slice(0, MAX_NOTE_EFFECTS)) {
    const type = isRecord(item) && typeof item.type === 'string' ? item.type : ''
    const definition = findNoteEffect(type)
    if (!isRecord(item) || !definition) {
      warn(`${where}: skipped an unknown MIDI effect "${type}"`)
      continue
    }
    const id = typeof item.id === 'string' && !usedIds.has(item.id) ? item.id : createId('fx')
    usedIds.add(id)
    const source = isRecord(item.params) ? item.params : {}
    effects.push({
      id,
      type,
      params: Object.fromEntries(
        definition.params.map((spec) => [spec.id, clamp(finiteNumber(source[spec.id], spec.default), spec.min, spec.max)]),
      ),
      bypassed: item.bypassed === true,
    })
  }
  return effects
}
