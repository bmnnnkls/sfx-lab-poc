import { MidiSettings } from '../midi/MidiSettings'
import { MAX_TEMPO, MIN_TEMPO } from '@core'
import { useEngineControls, useLayoutStore, useProjectStore, useStatusStore, useTouchStore } from '@state'
import { useKeyLabel, withKey } from '../commands/CommandHost'
import { LibraryMenu } from '../commands/LibraryMenu'
import { ViewMenu } from '../commands/ViewMenu'
import { FileMenu } from '../file-menu/FileMenu'
import { HistoryButtons } from '../history-buttons/HistoryButtons'
import { LevelMeter } from './LevelMeter'
import { TransportPosition } from './TransportPosition'
import styles from './TransportBar.module.css'

export const TransportBar = () => {
  const visible = useLayoutStore((state) => state.visible)
  const revealView = useLayoutStore((state) => state.revealView)
  const touch = useTouchStore()
  const controls = useEngineControls()
  const tempo = useProjectStore((state) => state.project.tempo)
  const setTempo = useProjectStore((state) => state.setTempo)
  const playing = useStatusStore((state) => state.status?.playing ?? false)
  // A button's own command's key, else the key that also does it (Space plays and stops; Tab switches the views).
  const playStopKey = useKeyLabel('transport.play-stop')
  const playKey = useKeyLabel('transport.play') ?? playStopKey
  const stopKey = useKeyLabel('transport.stop') ?? playStopKey
  const touchKey = useKeyLabel('transport.touch')
  const mainKey = useKeyLabel('view.toggle-main')
  const sessionKey = useKeyLabel('view.show.session') ?? mainKey
  const arrangementKey = useKeyLabel('view.show.arrangement') ?? mainKey

  return (
    <header className={styles.bar}>
      <strong className={styles.title}>SFX Lab</strong>
      <button onClick={controls.play} className={playing ? styles.active : undefined} aria-label="Play" title={withKey('Play', playKey)}>
        ▶
      </button>
      <button onClick={controls.stop} aria-label="Stop" title={withKey('Stop', stopKey)}>
        ■
      </button>
      <button aria-label="Arm Touch automation" aria-pressed={touch.armed} title={withKey("Record controls into each owner's playing clip or automation slot", touchKey)} className={touch.armed ? styles.active : undefined} onClick={() => touch.arm(!touch.armed)}>● Touch</button>
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
      <TransportPosition />
      <LevelMeter />
      <div className={styles.views}>
        <button
          className={visible.includes('session') ? styles.active : undefined}
          onClick={() => revealView('session')}
          aria-label="Session view"
          title={withKey('Session view', sessionKey)}
        >
          Session
        </button>
        <button
          className={visible.includes('arrangement') ? styles.active : undefined}
          onClick={() => revealView('arrangement')}
          aria-label="Arrangement view"
          title={withKey('Arrangement view', arrangementKey)}
        >
          Arrangement
        </button>
      </div>
      <HistoryButtons />
      <FileMenu />
      <ViewMenu />
      <LibraryMenu />
      <MidiSettings />
    </header>
  )
}
