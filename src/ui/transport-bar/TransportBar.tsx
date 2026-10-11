import { MAX_TEMPO, MIN_TEMPO } from '@core'
import { useEngineControls, useProjectStore, useStatusStore } from '@state'
import { formatPosition } from './format-position'
import styles from './TransportBar.module.css'

export const TransportBar = () => {
  const controls = useEngineControls()
  const tempo = useProjectStore((state) => state.project.tempo)
  const setTempo = useProjectStore((state) => state.setTempo)
  const playing = useStatusStore((state) => state.status?.playing ?? false)
  const beat = useStatusStore((state) => state.status?.beat ?? 0)

  return (
    <header className={styles.bar}>
      <strong className={styles.title}>SFX Lab</strong>
      <button onClick={controls.play} className={playing ? styles.active : undefined} aria-label="Play">
        ▶
      </button>
      <button onClick={controls.stop} aria-label="Stop">
        ■
      </button>
      <label className={styles.field}>
        BPM
        <input
          type="number"
          min={MIN_TEMPO}
          max={MAX_TEMPO}
          value={tempo}
          onChange={(event) => setTempo(Number(event.target.value) || tempo)}
        />
      </label>
      <span className={styles.position}>{formatPosition(beat)}</span>
    </header>
  )
}
