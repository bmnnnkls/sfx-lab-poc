import { pitchName } from '@core'
import { memo } from 'react'
import { ROW_HEIGHT, isBlackKey, pitchRows } from './piano-roll-geometry'
import styles from './PianoRoll.module.css'

/** The keyboard strip on the left; stays put while the roll scrolls horizontally. */
export const PianoKeys = memo(() => (
  <div className={styles.keys}>
    {pitchRows().map((pitch) => (
      <div
        key={pitch}
        className={`${styles.key} ${isBlackKey(pitch) ? styles.black : ''}`}
        style={{ height: ROW_HEIGHT }}
      >
        {pitch % 12 === 0 ? pitchName(pitch) : ''}
      </div>
    ))}
  </div>
))
