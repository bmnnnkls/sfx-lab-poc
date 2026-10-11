import { CLIP_NOTES_TYPE, NOTE_OUT_TYPE, type Track, describeNode } from '@core'
import { useEngineControls, useProjectStore, useSelectionStore } from '@state'
import styles from './SessionView.module.css'

export const TrackHeader = ({ track }: { track: Track }) => {
  const controls = useEngineControls()
  const setVolume = useProjectStore((state) => state.setTrackVolume)
  const removeTrack = useProjectStore((state) => state.removeTrack)
  const selected = useSelectionStore((state) => state.trackId === track.id)
  const selectTrack = useSelectionStore((state) => state.selectTrack)
  const setTab = useSelectionStore((state) => state.setTab)
  const modules = useProjectStore((state) => state.project.modules)
  // Everything in the note graph except where notes come in and go out counts as an effect.
  const effects =
    track.kind === 'instrument'
      ? track.noteGraph.nodes.filter((node) => node.type !== CLIP_NOTES_TYPE && node.type !== NOTE_OUT_TYPE)
      : []

  return (
    <div className={`${styles.header} ${selected ? styles.selected : ''}`}>
      <button className={styles.trackName} onClick={() => selectTrack(track.id)}>
        {track.name}
        {track.kind === 'audio' && <span className={styles.audioTag}> audio</span>}
      </button>
      {effects.length > 0 && (
        <button
          className={styles.fxBadge}
          title={`Note graph: ${effects.map((node) => describeNode(node, modules)?.label ?? node.type).join(', ')}`}
          aria-label={`${track.name} has ${effects.length} note effect${effects.length === 1 ? '' : 's'}`}
          onClick={() => {
            selectTrack(track.id)
            setTab('notes')
          }}
        >
          fx {effects.length}
        </button>
      )}
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
