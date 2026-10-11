import {
  MAX_NOTE_EFFECTS,
  NOTE_MODULE_TYPE,
  type NoteEffect,
  type NoteModuleLibrary,
  describeNoteEffect,
} from '../notefx'
import { clamp, createId } from '../shared'
import { type Warn, asList, finiteNumber, isRecord } from './raw'

/** A track's MIDI effect chain from untrusted data: unknown types are skipped, parameters clamped to their ranges. */
export const sanitizeNoteEffects = (raw: unknown, where: string, modules: NoteModuleLibrary, warn: Warn): NoteEffect[] => {
  const list = asList(raw)
  if (list.length > MAX_NOTE_EFFECTS) warn(`${where}: only the first ${MAX_NOTE_EFFECTS} MIDI effects were kept`)

  const usedIds = new Set<string>()
  const effects: NoteEffect[] = []
  for (const item of list.slice(0, MAX_NOTE_EFFECTS)) {
    const type = isRecord(item) && typeof item.type === 'string' ? item.type : ''
    const moduleId = isRecord(item) && type === NOTE_MODULE_TYPE && typeof item.moduleId === 'string' ? item.moduleId : undefined
    const shape = describeNoteEffect({ id: '', type, params: {}, bypassed: false, moduleId }, modules)
    if (!isRecord(item) || !shape) {
      warn(
        type === NOTE_MODULE_TYPE
          ? `${where}: skipped a use of a MIDI effect module that is not in the project`
          : `${where}: skipped an unknown MIDI effect "${type}"`,
      )
      continue
    }
    const id = typeof item.id === 'string' && !usedIds.has(item.id) ? item.id : createId('fx')
    usedIds.add(id)
    const source = isRecord(item.params) ? item.params : {}
    effects.push({
      id,
      type,
      ...(moduleId === undefined ? {} : { moduleId }),
      params: Object.fromEntries(
        shape.params.map((spec) => [spec.id, clamp(finiteNumber(source[spec.id], spec.default), spec.min, spec.max)]),
      ),
      bypassed: item.bypassed === true,
    })
  }
  return effects
}
