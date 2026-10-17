import { MidiSettings } from '../midi/MidiSettings'
import { MAX_TEMPO, MIN_TEMPO } from '@core'
import { useEngineControls, useProjectStore, useStatusStore, useTouchStore } from '@state'
import { FileMenu } from '../file-menu/FileMenu'
import { HistoryButtons } from '../history-buttons/HistoryButtons'
import { LevelMeter } from './LevelMeter'
import { formatPosition } from './format-position'
import styles from './TransportBar.module.css'

export const TransportBar = () => {
  const touch = useTouchStore()
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
      <button aria-label="Arm Touch automation" aria-pressed={touch.armed} title="Record controls into each owner's playing clip or automation slot" className={touch.armed ? styles.active : undefined} onClick={() => touch.arm(!touch.armed)}>● Touch</button>
      {touch.armed && <output className={styles.touchFeedback} title={touch.feedback} role="status">{touch.feedback}</output>}
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
      <LevelMeter />
      <HistoryButtons />
      <FileMenu />
      <MidiSettings />
    </header>
  )
}
