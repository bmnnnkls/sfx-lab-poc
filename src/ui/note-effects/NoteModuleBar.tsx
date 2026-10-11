import { type NoteModuleDefinition, noteModuleUsage, renameNoteModule } from '@core'
import { useProjectStore } from '@state'
import styles from './NoteEffects.module.css'

interface NoteModuleBarProps {
  definition: NoteModuleDefinition
  knobsOpen: boolean
  onToggleKnobs(): void
  /** Called after the module is deleted, so the editor can step out of it. */
  onDeleted(): void
}

/** Header shown while editing a MIDI effect module's inside: name, where it is used, and the knobs toggle. */
export const NoteModuleBar = ({ definition, knobsOpen, onToggleKnobs, onDeleted }: NoteModuleBarProps) => {
  const project = useProjectStore((state) => state.project)
  const updateModule = useProjectStore((state) => state.updateNoteModule)
  const deleteModule = useProjectStore((state) => state.deleteNoteModule)
  const usage = noteModuleUsage(project, definition.id)
  const where = [...usage.tracks, ...usage.modules]

  return (
    <div className={styles.moduleBar}>
      <label className={styles.nameField}>
        Module name
        <input
          value={definition.name}
          aria-label="Module name"
          onChange={(event) =>
            updateModule(definition.id, (module) => renameNoteModule(module, event.target.value || module.name), `note-module-name:${definition.id}`)
          }
        />
      </label>
      <span className={styles.usage} data-testid="note-module-usage">
        {usage.uses === 0 ? 'Not used yet.' : `Used ${usage.uses}× (${where.join(', ')}). Edits here change every use.`}
      </span>
      <button onClick={onToggleKnobs} aria-pressed={knobsOpen}>
        Knobs
      </button>
      <button
        disabled={usage.uses > 0}
        title={usage.uses > 0 ? 'Remove or unlink every use first' : 'Delete this module'}
        onClick={() => {
          deleteModule(definition.id)
          onDeleted()
        }}
      >
        Delete module
      </button>
    </div>
  )
}
