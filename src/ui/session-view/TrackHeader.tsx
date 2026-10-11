import type { Track } from '@core'
import { useEngineControls, useProjectStore, useSelectionStore } from '@state'
import styles from './SessionView.module.css'

export const TrackHeader = ({ track }: { track: Track }) => {
  const controls = useEngineControls()
  const setVolume = useProjectStore((state) => state.setTrackVolume)
  const removeTrack = useProjectStore((state) => state.removeTrack)
  const selected = useSelectionStore((state) => state.trackId === track.id)
  const selectTrack = useSelectionStore((state) => state.selectTrack)

  return (
    <div className={`${styles.header} ${selected ? styles.selected : ''}`}>
      <button className={styles.trackName} onClick={() => selectTrack(track.id)}>
        {track.name}
        {track.kind === 'audio' && <span className={styles.audioTag}> audio</span>}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={track.volume}
        aria-label={`${track.name} volume`}
        onChange={(event) => setVolume(track.id, Number(event.target.value))}
      />
      <button onClick={() => controls.stopTrack(track.id)} aria-label={`Stop ${track.name}`}>
        ■
      </button>
      <button onClick={() => removeTrack(track.id)} aria-label={`Remove ${track.name}`}>
        ×
      </button>
    </div>
  )
}
