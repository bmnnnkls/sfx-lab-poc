import { type Levels, selectionLevels } from '@core'
import type { WaveAudio, WaveSelection } from '@state'
import { useEffect, useState } from 'react'
import { formatTime } from './ruler-ticks'
import styles from './WaveEditor.module.css'

/** The selection has settled when it hasn't changed for this long: a drag changes it every frame. */
const SETTLE_MS = 150

const dbfs = (value: number) => (value < 1e-5 ? '−∞' : (20 * Math.log10(value)).toFixed(1).replace('-', '−'))

/** A frequency as the status bar says it: "200 Hz", "2.0 kHz". */
export const formatHz = (hz: number) => (hz < 1000 ? `${Math.round(hz)} Hz` : `${(hz / 1000).toFixed(1)} kHz`)

/** What the status bar says of a selection, or of the cursor without one. */
export const selectionText = (selection: WaveSelection | null, cursor: number, rate: number) => {
  if (!selection) return `Cursor ${formatTime(cursor / rate)}`
  const channels = selection.channels === 'both' ? '' : `, ${selection.channels} only`
  const band = selection.band ? ` · ${formatHz(selection.band.low)} – ${formatHz(selection.band.high)}` : ''
  return `Selection ${formatTime(selection.from / rate)} – ${formatTime(selection.to / rate)} (${formatTime((selection.to - selection.from) / rate)})${channels}${band}`
}

/**
 * The status bar: the cursor, or the selection's range, length, channels and band; the selection's peak and RMS in dBFS
 * (its time range's, with a band too); and the gestures the lanes take. The levels are computed once the selection settles, never during a drag ("…" meanwhile).
 */
export const WaveStatus = ({ wave, selection, cursor, rate }: { wave: WaveAudio | null; selection: WaveSelection | null; cursor: number; rate: number }) => {
  const levels = useSettledLevels(wave, selection)
  return (
    <div className={styles.statusBar}>
      <span className={styles.statusField} data-testid="wave-status">
        {selectionText(selection, cursor, rate)}
      </span>
      {selection && wave && (
        <span className={styles.statusField} data-testid="wave-levels" title={selection.band ? "The selection's time range's peak and RMS level, every frequency, the loudest of its channels" : "The selection's peak and RMS level, the loudest of its channels"}>
          {levels ? `Peak ${dbfs(levels.peak)} dBFS · RMS ${dbfs(levels.rms)} dBFS` : 'Peak … · RMS …'}
        </span>
      )}
      <span className={styles.statusHint}>Scroll to move · Ctrl/⌘ + scroll to zoom · Middle-drag to pan</span>
    </div>
  )
}

/** The selection's levels, once it has settled; null until then and without a selection. */
const useSettledLevels = (wave: WaveAudio | null, selection: WaveSelection | null): Levels | null => {
  const [settled, setSettled] = useState<{ audio: WaveAudio['audio']; selection: WaveSelection; levels: Levels } | null>(null)
  const audio = wave?.audio ?? null
  useEffect(() => {
    if (!audio || !selection) return
    const timer = setTimeout(() => setSettled({ audio, selection, levels: selectionLevels(audio, selection, selection.channels) }), SETTLE_MS)
    return () => clearTimeout(timer)
  }, [audio, selection])
  return settled && settled.audio === audio && settled.selection === selection ? settled.levels : null
}
