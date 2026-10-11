import {
  type InstrumentTrack,
  type NoteChainTarget,
  type NoteEffect,
  type NoteModuleLibrary,
  MAX_NOTE_EFFECTS,
  appendNewNoteEffect,
  containsNoteModule,
  isContiguous,
  noteEffectDefinitions,
} from '@core'
import { useProjectStore } from '@state'
import { useState } from 'react'
import { EffectCard } from './EffectCard'
import { HeardNotes } from './HeardNotes'
import { NoteModuleBar } from './NoteModuleBar'
import { NoteModuleKnobs } from './NoteModuleKnobs'
import styles from './NoteEffects.module.css'

/** The chain of one track, or (one level at a time) the inside of a MIDI effect module it uses. */
export const ChainEditor = ({ track }: { track: InstrumentTrack }) => {
  const modules = useProjectStore((state) => state.project.noteModules)
  const store = useProjectStore.getState

  const [path, setPath] = useState<readonly string[]>([])
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [knobsOpen, setKnobsOpen] = useState(true)

  // A module that disappeared (undo, delete) ends the path there.
  const missing = path.findIndex((id) => !modules.some((module) => module.id === id))
  const known = missing === -1 ? path : path.slice(0, missing)
  const definition = modules.find((module) => module.id === known.at(-1))
  const target: NoteChainTarget = definition ? { noteModuleId: definition.id } : { trackId: track.id }
  const effects: readonly NoteEffect[] = definition ? definition.effects : track.noteEffects

  const enter = (next: readonly string[]) => {
    setPath(next)
    setSelected(new Set())
  }
  const placeable = definition ? modules.filter((module) => !containsNoteModule(modules, module.id, definition.id)) : modules
  const crumbs = [{ label: track.name, path: [] as string[] }].concat(
    known.map((id, index) => ({
      label: modules.find((module) => module.id === id)?.name ?? '',
      path: known.slice(0, index + 1) as string[],
    })),
  )
  const canGroup = selected.size > 0 && isContiguous(effects, selected)

  const add = (value: string) => {
    if (!value) return
    if (value.startsWith('module:')) store().addNoteModuleUse(target, value.slice('module:'.length))
    else store().editNoteChain(target, (current) => appendNewNoteEffect(current, value))
  }

  return (
    <div className={styles.panel} data-testid="note-effects-panel" data-editing={definition ? 'module' : 'track'}>
      {known.length > 0 && (
        <nav className={styles.breadcrumb} aria-label="Chain location">
          {crumbs.map((crumb, index) => (
            <span key={crumb.path.join('/')}>
              {index > 0 && ' ▸ '}
              {index === crumbs.length - 1 ? (
                <strong className={styles.crumbCurrent}>{crumb.label}</strong>
              ) : (
                <button className={styles.crumb} onClick={() => enter(crumb.path)}>
                  {crumb.label}
                </button>
              )}
            </span>
          ))}
        </nav>
      )}
      {definition && (
        <NoteModuleBar
          definition={definition}
          knobsOpen={knobsOpen}
          onToggleKnobs={() => setKnobsOpen((open) => !open)}
          onDeleted={() => enter(known.slice(0, -1))}
        />
      )}

      <div className={styles.flow}>
        <div className={`${styles.end} ${styles.endIn}`}>
          <strong>{definition ? definition.name : track.name}</strong>
          <span>{definition ? 'notes in' : 'clip notes'}</span>
        </div>
        {effects.map((effect, index) => (
          <EffectCard
            key={effect.id}
            target={target}
            effect={effect}
            modules={modules}
            first={index === 0}
            last={index === effects.length - 1}
            selected={selected.has(effect.id)}
            onSelect={(on) =>
              setSelected((current) => {
                const next = new Set(current)
                if (on) next.add(effect.id)
                else next.delete(effect.id)
                return next
              })
            }
            onOpenModule={(moduleId) => enter([...known, moduleId])}
          />
        ))}
        <span className={styles.arrow} aria-hidden>
          →
        </span>
        <div className={styles.end}>
          <span>{definition ? 'notes out' : 'Voices → instrument'}</span>
        </div>
        <div className={styles.addColumn}>
          <label className={styles.add}>
            <select
              value=""
              aria-label="Add MIDI effect"
              disabled={effects.length >= MAX_NOTE_EFFECTS}
              onChange={(event) => add(event.target.value)}
            >
              <option value="">+ Add effect</option>
              {noteEffectDefinitions.map((effectDefinition) => (
                <option key={effectDefinition.type} value={effectDefinition.type}>
                  {effectDefinition.label}
                </option>
              ))}
              {placeable.length > 0 && (
                <optgroup label="Modules">
                  {placeable.map((module) => (
                    <option key={module.id} value={`module:${module.id}`}>
                      {module.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          <button
            disabled={!canGroup}
            title={
              selected.size === 0
                ? 'Tick effects (they must be neighbours) to turn them into a reusable module'
                : canGroup
                  ? 'Turn the ticked effects into a reusable module'
                  : 'The ticked effects must be next to each other'
            }
            onClick={() => {
              store().groupNoteEffects(target, [...selected])
              setSelected(new Set())
            }}
          >
            Group into module{selected.size > 0 ? ` (${selected.size})` : ''}
          </button>
        </div>
        {definition && knobsOpen && <NoteModuleKnobs definition={definition} modules={modules as NoteModuleLibrary} />}
      </div>

      {effects.length === 0 && (
        <p className={styles.hint}>
          {definition
            ? 'This module is empty. Add effects to it.'
            : 'No MIDI effects yet. Add an arpeggiator, scale lock or chord and the notes of this track’s clips change before they reach the instrument.'}
        </p>
      )}
      <HeardNotes track={track} />
    </div>
  )
}
