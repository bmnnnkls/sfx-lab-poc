import { useStatusStore } from '@state'
import { formatPosition } from './format-position'
import styles from './TransportBar.module.css'

/** The bar.beat readout. Owns its status subscription so the rest of the transport bar doesn't re-render at 30 Hz. */
export const TransportPosition = () => {
  const beat = useStatusStore((state) => state.status?.beat ?? 0)
  return <span className={styles.position}>{formatPosition(beat)}</span>
}
