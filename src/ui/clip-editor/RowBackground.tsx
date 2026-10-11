import { memo } from 'react'
import { ROW_HEIGHT, isBlackKey, pitchRows } from './piano-roll-geometry'
import styles from './PianoRoll.module.css'

/** The horizontal pitch stripes behind the notes. Static, so it is drawn once and never re-renders. */
export const RowBackground = memo(() => (
  <div className={styles.rows}>
    {pitchRows().map((pitch) => (
      <div
        key={pitch}
        className={`${styles.row} ${isBlackKey(pitch) ? styles.blackRow : ''} ${pitch % 12 === 0 ? styles.cRow : ''}`}
        style={{ height: ROW_HEIGHT }}
      />
    ))}
  </div>
))
