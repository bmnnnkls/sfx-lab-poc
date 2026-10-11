import {
  type NoteModuleDefinition,
  type NoteModuleLibrary,
  describeNoteEffect,
  exposeNoteKnob,
  hideNoteKnob,
  labelNoteKnob,
  noteKnobId,
} from '@core'
import { useProjectStore } from '@state'
import styles from './NoteEffects.module.css'

/** Chooses which parameters of a module's effects show as knobs on every use of the module. */
export const NoteModuleKnobs = ({ definition, modules }: { definition: NoteModuleDefinition; modules: NoteModuleLibrary }) => {
  const update = useProjectStore((state) => state.updateNoteModule)
  const change = (edit: (module: NoteModuleDefinition) => NoteModuleDefinition, key: string) =>
    update(definition.id, edit, `note-module-knob:${definition.id}:${key}`)

  const counts = new Map<string, number>()
  return (
    <aside className={styles.knobPanel} aria-label="Module knobs" data-testid="note-module-knobs">
      <h4>Knobs shown on the module</h4>
      {definition.effects.map((effect) => {
        const shape = describeNoteEffect(effect, modules)
        if (!shape || shape.params.length === 0) return null
        const index = (counts.get(shape.label) ?? 0) + 1
        counts.set(shape.label, index)
        return (
          <div key={effect.id} className={styles.knobGroup}>
            <strong>{index > 1 ? `${shape.label} ${index}` : shape.label}</strong>
            {shape.params.map((spec) => {
              const id = noteKnobId(effect.id, spec.id)
              const exposed = definition.knobs.find((knob) => knob.id === id)
              return (
                <div key={spec.id} className={styles.knobRow}>
                  <input
                    type="checkbox"
                    checked={exposed !== undefined}
                    aria-label={`Show ${spec.label} of ${shape.label} on the module`}
                    data-testid={`expose-${effect.id}-${spec.id}`}
                    onChange={(event) =>
                      change((module) => (event.target.checked ? exposeNoteKnob(module, effect.id, spec.id, spec.label) : hideNoteKnob(module, id)), `${effect.id}:${spec.id}`)
                    }
                  />
                  {exposed ? (
                    <input
                      type="text"
                      value={exposed.label}
                      aria-label={`Name of ${spec.label}`}
                      onChange={(event) => change((module) => labelNoteKnob(module, id, event.target.value || spec.label), `label:${id}`)}
                    />
                  ) : (
                    <span>{spec.label}</span>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </aside>
  )
}
