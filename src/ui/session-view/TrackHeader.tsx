import { CLIP_NOTES_TYPE, NOTE_OUT_TYPE, RETURN_IN_TYPE, TRACK_IN_TYPE, TRACK_OUT_TYPE, type ControlTarget, type Track, describeNode } from '@core'
import { type Subject, openTrackView, runAction, useProjectStore, useSelectionStore } from '@state'
import { useControlGesture } from '../controls/use-control-gesture'
import { EffectiveValue } from '../controls/EffectiveValue'
import { ActionMenu, useActionContext } from '../shared/menu'
import { InPlaceRename } from '../shared/RenameField'
import styles from './SessionView.module.css'

export const TrackHeader = ({ track }: { track: Track }) => {
  const context = useActionContext()
  const subject: Subject = { kind: 'track', trackId: track.id }
  const gesture = useControlGesture()
  const target: ControlTarget = { kind: 'mixer', owner: { kind: 'track', trackId: track.id }, control: 'volume' }
  const selected = useSelectionStore((state) => state.trackId === track.id)
  const selectTrack = useSelectionStore((state) => state.selectTrack)
  const modules = useProjectStore((state) => state.project.modules)
  // Everything in a graph except where the notes or the sound come in and go out counts as an effect.
  const ENDS = new Set([TRACK_IN_TYPE, TRACK_OUT_TYPE, RETURN_IN_TYPE])
  const soundEffects = track.fx.nodes.filter((node) => !ENDS.has(node.type))
  const effects =
    track.kind === 'instrument'
      ? track.noteGraph.nodes.filter((node) => node.type !== CLIP_NOTES_TYPE && node.type !== NOTE_OUT_TYPE)
      : []

  return (
    <ActionMenu subject={subject}>
    <div {...gesture.events} className={`${styles.header} ${selected ? styles.selected : ''} ${track.kind === 'return' ? styles.returnHeader : ''} ${track.muted ? styles.mutedHeader : ''}`}>
      <InPlaceRename subject={subject} name={track.name} label={`Name of ${track.name}`} className={styles.trackName}>
        <button className={styles.trackName} onClick={() => selectTrack(track.id)}>
          {track.name}
          {track.kind === 'audio' && <span className={styles.audioTag}> audio</span>}
          {track.kind === 'return' && <span className={styles.audioTag}> return</span>}
        </button>
      </InPlaceRename>
      {soundEffects.length > 0 && (
        <button
          className={styles.fxBadge}
          title={`Effects: ${soundEffects.map((node) => describeNode(node, modules)?.label ?? node.type).join(', ')}`}
          aria-label={`${track.name} has ${soundEffects.length} effect${soundEffects.length === 1 ? '' : 's'}`}
          onClick={() => openTrackView(track.id, 'effects')}
        >
          fx {soundEffects.length}
        </button>
      )}
      {effects.length > 0 && (
        <button
          className={styles.fxBadge}
          title={`Note graph: ${effects.map((node) => describeNode(node, modules)?.label ?? node.type).join(', ')}`}
          aria-label={`${track.name} has ${effects.length} note effect${effects.length === 1 ? '' : 's'}`}
          onClick={() => openTrackView(track.id, 'notes')}
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
        onChange={(event) => gesture.change([{ target, value: Number(event.target.value) }])}
      />
      <EffectiveValue target={target} />
      {track.kind !== 'return' && (
        <button onClick={() => runAction('track.stop', subject, context)} aria-label={`Stop ${track.name}`}>
          ■
        </button>
      )}
      <button onClick={() => runAction('track.delete', subject, context)} aria-label={`Remove ${track.name}`}>
        ×
      </button>
    </div>
    </ActionMenu>
  )
}
