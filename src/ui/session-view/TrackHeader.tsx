import { CLIP_NOTES_TYPE, NOTE_OUT_TYPE, RETURN_IN_TYPE, TRACK_IN_TYPE, TRACK_OUT_TYPE, type Track, describeNode } from '@core'
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
  const tracks = useProjectStore((state) => state.project.tracks)
  const setSend = useProjectStore((state) => state.setTrackSend)
  const returns = tracks.filter((candidate) => candidate.kind === 'return')
  // Everything in a graph except where the notes or the sound come in and go out counts as an effect.
  const ENDS = new Set([TRACK_IN_TYPE, TRACK_OUT_TYPE, RETURN_IN_TYPE])
  const soundEffects = track.fx.nodes.filter((node) => !ENDS.has(node.type))
  const effects =
    track.kind === 'instrument'
      ? track.noteGraph.nodes.filter((node) => node.type !== CLIP_NOTES_TYPE && node.type !== NOTE_OUT_TYPE)
      : []

  return (
    <div className={`${styles.header} ${selected ? styles.selected : ''} ${track.kind === 'return' ? styles.returnHeader : ''}`}>
      <button className={styles.trackName} onClick={() => selectTrack(track.id)}>
        {track.name}
        {track.kind === 'audio' && <span className={styles.audioTag}> audio</span>}
        {track.kind === 'return' && <span className={styles.audioTag}> return</span>}
      </button>
      {soundEffects.length > 0 && (
        <button
          className={styles.fxBadge}
          title={`Effects: ${soundEffects.map((node) => describeNode(node, modules)?.label ?? node.type).join(', ')}`}
          aria-label={`${track.name} has ${soundEffects.length} effect${soundEffects.length === 1 ? '' : 's'}`}
          onClick={() => {
            selectTrack(track.id)
            setTab('fx')
          }}
        >
          fx {soundEffects.length}
        </button>
      )}
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
          notes {effects.length}
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
      {track.kind !== 'return' && returns.length > 0 && (
        <div className={styles.sends} role="group" aria-label={`${track.name} sends`}>
          {returns.map((target) => (
            <label key={target.id} className={styles.send} title={`Send to ${target.name} (post-fader: after the effects and the volume)`}>
              <span>{target.name.replace(/^Return /, '')}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={track.sends[target.id] ?? 0}
                aria-label={`${track.name} send to ${target.name}`}
                onChange={(event) => setSend(track.id, target.id, Number(event.target.value))}
              />
            </label>
          ))}
        </div>
      )}
      {track.kind !== 'return' && (
        <button onClick={() => controls.stopTrack(track.id)} aria-label={`Stop ${track.name}`}>
          ■
        </button>
      )}
      <button onClick={() => removeTrack(track.id)} aria-label={`Remove ${track.name}`}>
        ×
      </button>
    </div>
  )
}
