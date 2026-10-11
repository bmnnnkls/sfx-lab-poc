import { useStatusStore } from '@state'
import styles from './TransportBar.module.css'

/** Master output level, as reported by the engine (peak since the previous status update). */
export const LevelMeter = () => {
  const peak = useStatusStore((state) => state.status?.peak ?? 0)
  return (
    <div className={styles.meter} title="Output level" data-peak={peak.toFixed(3)}>
      <div className={styles.meterFill} style={{ width: `${Math.min(1, peak) * 100}%` }} />
    </div>
  )
}
