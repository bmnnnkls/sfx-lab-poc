import { type Levels, selectionLevels } from '@core'
import type { WaveAudio, WaveSelection } from '@state'
import { useEffect, useState } from 'react'
import { formatTime } from './ruler-ticks'
import styles from './WaveEditor.module.css'

/** The selection has settled when it hasn't changed for this long: a drag changes it every frame. */
const SETTLE_MS = 150

const dbfs = (value: number) => (value < 1e-5 ? '−∞' : (20 * Math.log10(value)).toFixed(1).replace('-', '−'))

/**
 * The status bar: the cursor, or the selection's range, length and channels; the selection's peak and RMS in dBFS; and
 * the gestures the lanes take. The levels are computed once the selection settles, never during a drag ("…" meanwhile).
 */
export const WaveStatus = ({ wave, selection, cursor, rate }: { wave: WaveAudio | null; selection: WaveSelection | null; cursor: number; rate: number }) => {
  const levels = useSettledLevels(wave, selection)
  return (
    <div className={styles.statusBar}>
      <span className={styles.statusField} data-testid="wave-status">
        {selection
          ? `Selection ${formatTime(selection.from / rate)} – ${formatTime(selection.to / rate)} (${formatTime((selection.to - selection.from) / rate)})${selection.channels === 'both' ? '' : `, ${selection.channels} only`}`
          : `Cursor ${formatTime(cursor / rate)}`}
      </span>
      {selection && wave && (
        <span className={styles.statusField} data-testid="wave-levels" title="The selection's peak and RMS level, the loudest of its channels">
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
