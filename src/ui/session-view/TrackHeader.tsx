import { CLIP_NOTES_TYPE, NOTE_OUT_TYPE, RETURN_IN_TYPE, TRACK_IN_TYPE, TRACK_OUT_TYPE, type ControlTarget, type GroupColour, type Track, describeNode, mixRouting } from '@core'
import { type SubjectOf, openTrackView, runAction, useProjectStore, useSelectionStore } from '@state'
import { useControlGesture } from '../controls/use-control-gesture'
import { EffectiveValue } from '../controls/EffectiveValue'
import type { CSSProperties } from 'react'
import { useDragSource, useEdgeTarget } from '../shared/drag'
import { Icon } from '../shared/icon'
import { ActionMenu, useActionContext } from '../shared/menu'
import { InPlaceRename, useRenaming } from '../shared/RenameField'
import styles from './SessionView.module.css'
import { describeTrackInput, trackInputTag } from '../midi/track-input'
import { ArmButton } from '../shared/ArmButton'

/** A track's column header. `stripe` is the colour of the group it is in. */
export const TrackHeader = ({ track, stripe }: { track: Track; stripe?: GroupColour }) => {
  const context = useActionContext()
  const subject: SubjectOf<'track'> = { kind: 'track', trackId: track.id }
  const gesture = useControlGesture()
  // A preset or a library graph dropped here goes onto this track; a track or a group lands on the side it is over.
  const drop = useEdgeTarget(subject, 'x')
  // The name drags the track: the slider must keep its own gesture.
  const drag = useDragSource(useRenaming(subject) ? null : subject)
  const target: ControlTarget = { kind: 'mixer', owner: { kind: 'track', trackId: track.id }, control: 'volume' }
  const selected = useSelectionStore((state) => state.trackId === track.id)
  const selectTrack = useSelectionStore((state) => state.selectTrack)
  const modules = useProjectStore((state) => state.project.modules)
  // Muted by its own flag or through a group.
  const muted = useProjectStore((state) => mixRouting(state.project).get(track.id)?.muted ?? false)
  // Everything in a graph except where the notes or the sound come in and go out counts as an effect.
  const ENDS = new Set([TRACK_IN_TYPE, TRACK_OUT_TYPE, RETURN_IN_TYPE])
  const soundEffects = track.fx.nodes.filter((node) => !ENDS.has(node.type))
  const effects =
    track.kind === 'instrument'
      ? track.noteGraph.nodes.filter((node) => node.type !== CLIP_NOTES_TYPE && node.type !== NOTE_OUT_TYPE)
      : []

  return (
    <ActionMenu subject={subject}>
    <div {...gesture.events} {...drop} style={stripe && ({ '--group': `var(--group-${stripe})` } as CSSProperties)} data-stripe={stripe} className={`${styles.header} ${selected ? styles.selected : ''} ${track.kind === 'return' ? styles.returnHeader : ''} ${muted ? styles.mutedHeader : ''}`}>
      <InPlaceRename subject={subject} name={track.name} label={`Name of ${track.name}`} className={styles.trackName}>
        <button className={styles.trackName} onClick={() => selectTrack(track.id)} {...drag}>
          {track.name}
          {track.kind === 'audio' && <span className={styles.audioTag}> audio</span>}
          {track.kind === 'return' && <span className={styles.audioTag}> return</span>}
          {track.kind === 'instrument' && track.midiInput && (
            <span className={styles.audioTag} data-tooltip={`MIDI input: ${describeTrackInput(track.midiInput)}. Set in MIDI settings.`}> {trackInputTag(track.midiInput)}</span>
          )}
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
          <Icon name="stop" filled size={14} />
        </button>
      )}
      {track.kind === 'instrument' && <ArmButton trackId={track.id} name={track.name} />}
      <button onClick={() => runAction('track.delete', subject, context)} aria-label={`Remove ${track.name}`}>
        <Icon name="close" size={14} />
      </button>
    </div>
    </ActionMenu>
  )
}
