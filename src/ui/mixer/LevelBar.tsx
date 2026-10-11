import { type EngineStatus } from '@core'
import { useStatusStore } from '@state'
import { useRef } from 'react'
import styles from './Mixer.module.css'

/** Each status update the shown level falls to this fraction of itself, unless the new peak is higher (about 0.3 s to fade). */
const FALL = 0.8
/** The bottom of the bar; anything quieter is shown as empty. */
const FLOOR_DB = -60

/** Where a level (0..1, linear) sits on the bar, 0..1, on a dB scale so quiet sound is still visible. */
const barHeight = (level: number): number =>
  level <= 0 ? 0 : Math.min(1, Math.max(0, 1 - Math.log10(Math.min(level, 1)) * 20 / FLOOR_DB))

/**
 * A vertical level bar fed by the engine's status: `read` picks the peak to show (a track's, or the output's). The
 * engine reports raw peaks since the previous update; the bar falls slowly instead of flickering (`data-peak` is the raw one).
 */
export const LevelBar = ({ label, read }: { label: string; read: (status: EngineStatus) => number }) => {
  const status = useStatusStore((state) => state.status)
  const held = useRef(0)
  const peak = status ? read(status) : 0
  held.current = Math.max(peak, held.current * FALL)
  return (
    <div className={styles.meter} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={1} aria-valuenow={peak} data-peak={peak.toFixed(3)}>
      <div className={styles.meterCover} style={{ height: `${(1 - barHeight(held.current)) * 100}%` }} />
    </div>
  )
}
