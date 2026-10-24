import { useStatusStore } from '@state'
import styles from './arrangement.module.css'

/** The moving line across a lane while the transport plays. Owns its status subscription so the timeline doesn't re-render at 30 Hz. */
export const ArrangementPlayhead = ({ pxPerBeat }: { pxPerBeat: number }) => {
  const beat = useStatusStore((state) => (state.status?.playing ? state.status.beat : null))
  if (beat === null) return null
  return <div className={styles.playhead} style={{ left: beat * pxPerBeat }} />
}
