import { ActionMenu, useActionContext } from '../shared/menu'
import { InPlaceRename } from '../shared/RenameField'
import { type ControlTarget, RETURN_IN_TYPE, TRACK_IN_TYPE, TRACK_OUT_TYPE, type Track, describeNode, mixesAfter, panOf } from '@core'
import { type Subject, openTrackView, runAction, useProjectStore, useSelectionStore } from '@state'
import { useControlGesture } from '../controls/use-control-gesture'
import { EffectiveValue } from '../controls/EffectiveValue'
import { LevelBar } from './LevelBar'
import styles from './Mixer.module.css'

/** Everything in a graph except where the sound comes in and goes out counts as an effect. */
const ENDS = new Set([TRACK_IN_TYPE, TRACK_OUT_TYPE, RETURN_IN_TYPE])

/** The fx badge, which opens the Effects tab on this track. */
export const EffectsBadge = ({ name, labels, onOpen }: { name: string; labels: string[]; onOpen: () => void }) =>
  labels.length === 0 ? null : (
    <button
      className={styles.fxBadge}
      title={`Effects: ${labels.join(', ')}`}
      aria-label={`${name} has ${labels.length} effect${labels.length === 1 ? '' : 's'}`}
      onClick={onOpen}
    >
      fx {labels.length}
    </button>
  )

/** One track in the mixer: pan, sends, mute and solo, the fader and the track's own level meter. */
export const ChannelStrip = ({ track }: { track: Track }) => {
  const selected = useSelectionStore((state) => state.trackId === track.id)
  const selectTrack = useSelectionStore((state) => state.selectTrack)
  const modules = useProjectStore((state) => state.project.modules)
  const tracks = useProjectStore((state) => state.project.tracks)
  const gesture = useControlGesture()
  const target = (control: 'volume' | 'pan'): ControlTarget => ({ kind: 'mixer', owner: { kind: 'track', trackId: track.id }, control })
  const setVolume = (_id: string, value: number) => gesture.change([{ target: target('volume'), value }])
  const setPan = (_id: string, value: number) => gesture.change([{ target: target('pan'), value }])
  const context = useActionContext()
  const subject: Subject = { kind: 'track', trackId: track.id }
  const sendTarget = (returnId: string): ControlTarget => ({ kind: 'mixer', owner: { kind: 'track', trackId: track.id }, control: 'send', returnId })
  const setSend = (_id: string, returnId: string, value: number) => gesture.change([{ target: sendTarget(returnId), value }])

  const returns = tracks.filter((candidate) => candidate.kind === 'return')
  const effects = track.fx.nodes.filter((node) => !ENDS.has(node.type))
  const labels = effects.map((node) => describeNode(node, modules)?.label ?? node.type)
  const muted = track.muted === true
  const soloed = track.soloed === true
  const pan = panOf(track)

  return (
    <ActionMenu subject={subject}>
    <section
      {...gesture.events}
      className={`${styles.strip} ${selected ? styles.selected : ''} ${track.kind === 'return' ? styles.returnStrip : ''} ${muted ? styles.mutedStrip : ''}`}
      aria-label={`${track.name} channel`}
    >
      <InPlaceRename subject={subject} name={track.name} label={`Name of ${track.name}`} className={styles.name}>
        <button className={styles.name} onClick={() => selectTrack(track.id)} title={`Select ${track.name}`}>
          {track.name}
          {track.kind !== 'instrument' && <span className={styles.kind}> {track.kind}</span>}
        </button>
      </InPlaceRename>
      <div className={styles.badges}>
        <EffectsBadge
          name={track.name}
          labels={labels}
          onOpen={() => openTrackView(track.id, 'effects')}
        />
      </div>

      <label className={styles.pan} title="Pan (double-click to centre)">
        <span>{pan === 0 ? 'C' : pan < 0 ? `L${Math.round(-pan * 100)}` : `R${Math.round(pan * 100)}`}</span>
        <ActionMenu subject={{ kind: 'control', targets: [target('pan')] }}><input
          type="range"
          min={-1}
          max={1}
          step={0.01}
          value={pan}
          aria-label={`${track.name} pan`}
          onChange={(event) => setPan(track.id, Number(event.target.value))}
          onDoubleClick={() => setPan(track.id, 0)}
        /></ActionMenu>
        <EffectiveValue target={target('pan')} />
      </label>

      {track.kind !== 'return' && returns.length > 0 && (
        <div className={styles.sends} role="group" aria-label={`${track.name} sends`}>
          {returns.map((target) => {
            // A track that takes audio from a return cannot send to it as well: that would be a loop.
            const loop = mixesAfter({ tracks, modules }, track.id, target.id)
            const title = loop
              ? `${track.name} takes audio from ${target.name}, so it cannot send to it`
              : `Send to ${target.name} (post-fader: after the effects and the volume)`
            return (
              <label key={target.id} className={styles.send} title={title}>
                <span>{target.name}</span>
                <ActionMenu subject={{ kind: 'control', targets: [sendTarget(target.id)] }}><input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={track.sends[target.id] ?? 0}
                  aria-label={`${track.name} send to ${target.name}`}
                  disabled={loop}
                  onChange={(event) => setSend(track.id, target.id, Number(event.target.value))}
                /></ActionMenu>
                <EffectiveValue target={sendTarget(target.id)} />
              </label>
            )
          })}
        </div>
      )}

      <div className={styles.buttons}>
        <button className={muted ? styles.mute : ''} aria-pressed={muted} aria-label={`${track.name} mute`} title="Mute: silence the track, including its sends" onClick={() => runAction('track.mute', subject, context)}>
          M
        </button>
        <button className={soloed ? styles.solo : ''} aria-pressed={soloed} aria-label={`${track.name} solo`} title="Solo: hear only soloed tracks (and the returns they feed)" onClick={() => runAction('track.solo', subject, context)}>
          S
        </button>
      </div>

      <div className={styles.faderRow}>
        <ActionMenu subject={{ kind: 'control', targets: [target('volume')] }}><input
          className={styles.fader}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={track.volume}
          aria-label={`${track.name} fader`}
          aria-orientation="vertical"
          onChange={(event) => setVolume(track.id, Number(event.target.value))}
        /></ActionMenu>
        <LevelBar label={`${track.name} level`} read={(status) => status.peaks[track.id] ?? 0} />
      </div>
      <EffectiveValue target={target('volume')} />
      <output className={styles.value}>{Math.round(track.volume * 100)}</output>
    </section>
    </ActionMenu>
  )
}
