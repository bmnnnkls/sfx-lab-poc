import { MAX_CLIP_BEATS, MIN_CLIP_BEATS } from '@core'
import { useEffect, useState } from 'react'
import styles from './ClipEditor.module.css'

interface LengthFieldProps {
  lengthBeats: number
  onCommit(lengthBeats: number): void
}

/**
 * Clip length in beats. Applies on Enter or when the field loses focus, never per keystroke:
 * typing "16" would otherwise briefly set the length to 1 and trim away the notes.
 */
export const LengthField = ({ lengthBeats, onCommit }: LengthFieldProps) => {
  const [text, setText] = useState(String(lengthBeats))
  useEffect(() => setText(String(lengthBeats)), [lengthBeats])

  const commit = () => {
    const value = Number(text)
    if (Number.isFinite(value) && value > 0 && value !== lengthBeats) onCommit(value)
    else setText(String(lengthBeats))
  }

  const bars = lengthBeats / 4
  return (
    <label className={styles.field} title="Clip length. Shortening trims notes that no longer fit (undo restores them).">
      Length
      <input
        className={styles.length}
        type="number"
        min={MIN_CLIP_BEATS}
        max={MAX_CLIP_BEATS}
        value={text}
        aria-label="Clip length in beats"
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
      />
      <span className={styles.hint}>beats ({Number.isInteger(bars) ? `${bars} bar${bars === 1 ? '' : 's'}` : `${bars.toFixed(2)} bars`})</span>
    </label>
  )
}
