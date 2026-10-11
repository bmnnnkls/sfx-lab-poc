import { type NoteModuleDefinition, type NoteModuleKnob, type NoteModuleLibrary, noteKnobId, pruneNoteModuleKnobs } from '../notefx'
import { type Entry, buildInDependencyOrder } from './dependency-order'
import { LIMITS } from './format'
import { type Raw, type Warn, asList, isRecord, nonEmptyText } from './raw'
import { sanitizeNoteEffects } from './sanitize-note-effects'

const readKnobs = (raw: unknown): NoteModuleKnob[] =>
  asList(raw)
    .slice(0, LIMITS.portsPerModule)
    .flatMap((item) =>
      isRecord(item) && typeof item.effect === 'string' && typeof item.param === 'string'
        ? [{ id: noteKnobId(item.effect, item.param), label: nonEmptyText(item.label, item.param, 40), effect: item.effect, param: item.param }]
        : [],
    )

const sanitizeNoteModule = (raw: Raw, id: string, library: NoteModuleLibrary, warn: Warn): NoteModuleDefinition => {
  const name = nonEmptyText(raw.name, 'MIDI module', 60)
  const where = `MIDI module "${name}"`
  const definition: NoteModuleDefinition = {
    id,
    name,
    effects: sanitizeNoteEffects(raw.effects, where, library, warn),
    knobs: readKnobs(raw.knobs),
  }
  const pruned = pruneNoteModuleKnobs(definition, library)
  if (pruned !== definition) warn(`${where}: dropped knobs that point at things that do not exist`)
  return pruned
}

const referencedNoteModules = (raw: Raw): string[] =>
  asList(raw.effects).flatMap((effect) =>
    isRecord(effect) && effect.type === 'module' && typeof effect.moduleId === 'string' ? [effect.moduleId] : [],
  )

/** The MIDI effect module library of a file, built so that every module comes after the ones it uses. */
export const sanitizeNoteModules = (raw: unknown, warn: Warn): NoteModuleDefinition[] => {
  const rawList = asList(raw)
  if (rawList.length > LIMITS.modules) warn(`Only the first ${LIMITS.modules} MIDI modules were kept`)

  const seen = new Set<string>()
  const entries: Entry[] = []
  for (const item of rawList.slice(0, LIMITS.modules)) {
    if (!isRecord(item) || typeof item.id !== 'string' || seen.has(item.id)) {
      warn('Skipped a malformed or duplicate MIDI module')
      continue
    }
    seen.add(item.id)
    entries.push({ raw: item, id: item.id })
  }

  return buildInDependencyOrder<NoteModuleDefinition>(
    entries,
    referencedNoteModules,
    (entry, library) => sanitizeNoteModule(entry.raw, entry.id, library, warn),
    (count) => warn(`Dropped ${count} MIDI module(s) that contain themselves`),
  )
}
