import { type EngineStatus } from '@core'
import { useStatusStore } from '@state'
import { useEffect, useRef } from 'react'
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
 * It changes on every status update, so it writes to the DOM from a store subscription instead of re-rendering.
 */
export const LevelBar = ({ label, read }: { label: string; read: (status: EngineStatus) => number }) => {
  const meter = useRef<HTMLDivElement>(null)
  const cover = useRef<HTMLDivElement>(null)
  const reader = useRef(read)
  useEffect(() => {
    reader.current = read
  })

  useEffect(() => {
    let held = 0
    const show = (status: EngineStatus | null) => {
      const peak = status ? reader.current(status) : 0
      held = Math.max(peak, held * FALL)
      meter.current?.setAttribute('aria-valuenow', String(peak))
      meter.current?.setAttribute('data-peak', peak.toFixed(3))
      if (cover.current) cover.current.style.height = `${(1 - barHeight(held)) * 100}%`
    }
    show(useStatusStore.getState().status)
    return useStatusStore.subscribe((state, previous) => {
      if (state.status !== previous.status) show(state.status)
    })
  }, [])

  // React renders the empty bar once; the subscription owns these attributes from then on.
  return (
    <div ref={meter} className={styles.meter} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={1} aria-valuenow={0} data-peak="0.000">
      <div ref={cover} className={styles.meterCover} style={{ height: '100%' }} />
    </div>
  )
}
