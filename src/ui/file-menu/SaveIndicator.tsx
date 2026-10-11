import { usePersistenceStore } from '@state'
import styles from './FileMenu.module.css'

const LABELS = {
  saved: 'Saved',
  unsaved: 'Saving…',
  error: 'Not saved',
  'memory-only': 'Not stored (browser storage unavailable)',
} as const

export const SaveIndicator = () => {
  const saveState = usePersistenceStore((state) => state.saveState)
  const error = usePersistenceStore((state) => state.saveError)

  return (
    <span
      className={`${styles.indicator} ${styles[saveState === 'memory-only' ? 'memoryOnly' : saveState]}`}
      title={error ?? undefined}
    >
      {LABELS[saveState]}
    </span>
  )
}
