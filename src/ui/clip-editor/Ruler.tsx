import { BEATS_PER_BAR, RULER_HEIGHT } from './piano-roll-geometry'
import styles from './PianoRoll.module.css'

/** Bar numbers along the top; stays put while the roll scrolls vertically. */
export const Ruler = ({ lengthBeats, pixelsPerBeat }: { lengthBeats: number; pixelsPerBeat: number }) => {
  const bars = Math.ceil(lengthBeats / BEATS_PER_BAR)
  return (
    <div className={styles.ruler} style={{ width: lengthBeats * pixelsPerBeat, height: RULER_HEIGHT }}>
      {Array.from({ length: bars }, (_, bar) => (
        <span key={bar} className={styles.bar} style={{ left: bar * BEATS_PER_BAR * pixelsPerBeat }}>
          {bar + 1}
        </span>
      ))}
    </div>
  )
}
