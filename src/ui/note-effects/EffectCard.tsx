import {
  type NoteChainTarget,
  type NoteEffect,
  type NoteModuleLibrary,
  describeNoteEffect,
  moveNoteEffectIn,
  removeNoteEffectFrom,
  setNoteEffectBypassedIn,
  setNoteEffectParamIn,
} from '@core'
import { useProjectStore } from '@state'
import { ParamControl } from '../patcher/ParamControl'
import styles from './NoteEffects.module.css'

interface EffectCardProps {
  target: NoteChainTarget
  effect: NoteEffect
  modules: NoteModuleLibrary
  first: boolean
  last: boolean
  /** Ticked for grouping into a module. */
  selected: boolean
  onSelect(on: boolean): void
  onOpenModule(moduleId: string): void
}

const scopeOf = (target: NoteChainTarget): string => ('trackId' in target ? target.trackId : target.noteModuleId)

/** One entry of the chain: tick to select, name, bypass / move / remove, and its parameters or knobs. */
export const EffectCard = ({ target, effect, modules, first, last, selected, onSelect, onOpenModule }: EffectCardProps) => {
  const editChain = useProjectStore((state) => state.editNoteChain)
  const unlink = useProjectStore((state) => state.unlinkNoteModule)
  const shape = describeNoteEffect(effect, modules)
  if (!shape) return null
  const isModule = effect.moduleId !== undefined

  return (
    <>
      <span className={styles.arrow} aria-hidden>
        →
      </span>
      <section
        className={`${styles.card} ${effect.bypassed ? styles.bypassed : ''} ${selected ? styles.selected : ''}`}
        aria-label={shape.label}
        data-testid={`fx-${effect.type}`}
        data-selected={selected}
      >
        <header className={styles.cardHeader}>
          <label className={styles.tick}>
            <input
              type="checkbox"
              checked={selected}
              aria-label={`Select ${shape.label}`}
              onChange={(event) => onSelect(event.target.checked)}
            />
            <strong>{shape.label}</strong>
          </label>
          <span className={styles.actions}>
            <button
              onClick={() => editChain(target, (effects) => setNoteEffectBypassedIn(effects, effect.id, !effect.bypassed))}
              aria-pressed={effect.bypassed}
              title={effect.bypassed ? 'Switch on' : 'Bypass: let notes through unchanged'}
              aria-label={`${effect.bypassed ? 'Enable' : 'Bypass'} ${shape.label}`}
            >
              {effect.bypassed ? 'Off' : 'On'}
            </button>
            <button disabled={first} onClick={() => editChain(target, (effects) => moveNoteEffectIn(effects, effect.id, -1))} aria-label={`Move ${shape.label} earlier`}>
              ←
            </button>
            <button disabled={last} onClick={() => editChain(target, (effects) => moveNoteEffectIn(effects, effect.id, 1))} aria-label={`Move ${shape.label} later`}>
              →
            </button>
            <button onClick={() => editChain(target, (effects) => removeNoteEffectFrom(effects, effect.id))} aria-label={`Remove ${shape.label}`}>
              ×
            </button>
          </span>
        </header>
        {shape.params.map((spec) => (
          <ParamControl
            key={spec.id}
            spec={spec}
            value={effect.params[spec.id] ?? spec.default}
            onChange={(value) =>
              editChain(
                target,
                (effects, library) => setNoteEffectParamIn(effects, effect.id, spec.id, value, library),
                `fx:${scopeOf(target)}:${effect.id}:${spec.id}`,
              )
            }
          />
        ))}
        {isModule && effect.moduleId && (
          <div className={styles.moduleFooter}>
            <em className={styles.moduleTag}>module</em>
            <button onClick={() => onOpenModule(effect.moduleId as string)} title="Edit the module; every use of it changes">
              Edit
            </button>
            <button onClick={() => unlink(target, effect.id)} title="Replace this use by an independent copy of its effects">
              Unlink
            </button>
          </div>
        )}
      </section>
    </>
  )
}
