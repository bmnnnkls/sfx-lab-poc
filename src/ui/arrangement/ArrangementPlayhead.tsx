import { useStatusStore } from '@state'
import styles from './arrangement.module.css'

/**
 * The moving line across every lane while the arrangement plays (not while the session does). One for the whole
 * timeline, owning its status subscription so nothing else re-renders at the status rate.
 */
export const ArrangementPlayhead = ({ pxPerBeat }: { pxPerBeat: number }) => {
  const beat = useStatusStore((state) => (state.status?.playing && state.status.mode === 'arrangement' ? state.status.beat : null))
  if (beat === null) return null
  return <div className={styles.playhead} data-testid="arrangement-playhead" style={{ left: beat * pxPerBeat }} />
}
