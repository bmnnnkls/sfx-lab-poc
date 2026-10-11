import { type NoteEffect, findNoteEffect } from '@core'
import { useProjectStore } from '@state'
import { ParamControl } from '../patcher/ParamControl'
import styles from './NoteEffects.module.css'

interface EffectCardProps {
  trackId: string
  effect: NoteEffect
  first: boolean
  last: boolean
}

/** One effect in the chain: name, bypass / move / remove, and its parameters. */
export const EffectCard = ({ trackId, effect, first, last }: EffectCardProps) => {
  const setParam = useProjectStore((state) => state.setNoteEffectParam)
  const setBypassed = useProjectStore((state) => state.setNoteEffectBypassed)
  const move = useProjectStore((state) => state.moveNoteEffect)
  const remove = useProjectStore((state) => state.removeNoteEffect)
  const definition = findNoteEffect(effect.type)
  if (!definition) return null

  return (
    <>
      <span className={styles.arrow} aria-hidden>
        →
      </span>
      <section
        className={`${styles.card} ${effect.bypassed ? styles.bypassed : ''}`}
        aria-label={definition.label}
        data-testid={`fx-${effect.type}`}
      >
        <header className={styles.cardHeader}>
          <strong>{definition.label}</strong>
          <span className={styles.actions}>
            <button
              onClick={() => setBypassed(trackId, effect.id, !effect.bypassed)}
              aria-pressed={effect.bypassed}
              title={effect.bypassed ? 'Switch on' : 'Bypass: let notes through unchanged'}
              aria-label={`${effect.bypassed ? 'Enable' : 'Bypass'} ${definition.label}`}
            >
              {effect.bypassed ? 'Off' : 'On'}
            </button>
            <button disabled={first} onClick={() => move(trackId, effect.id, -1)} aria-label={`Move ${definition.label} earlier`}>
              ←
            </button>
            <button disabled={last} onClick={() => move(trackId, effect.id, 1)} aria-label={`Move ${definition.label} later`}>
              →
            </button>
            <button onClick={() => remove(trackId, effect.id)} aria-label={`Remove ${definition.label}`}>
              ×
            </button>
          </span>
        </header>
        {definition.params.map((spec) => (
          <ParamControl
            key={spec.id}
            spec={spec}
            value={effect.params[spec.id] ?? spec.default}
            onChange={(value) => setParam(trackId, effect.id, spec.id, value)}
          />
        ))}
      </section>
    </>
  )
}
