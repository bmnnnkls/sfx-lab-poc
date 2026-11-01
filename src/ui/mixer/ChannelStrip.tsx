import type { CSSProperties } from 'react'
import { useDragSource, useEdgeTarget } from '../shared/drag'
import { ActionMenu, useActionContext } from '../shared/menu'
import { InPlaceRename, useRenaming } from '../shared/RenameField'
import {
  type ChannelRoute,
  type ControlOwner,
  type ControlTarget,
  GROUP_IN_TYPE,
  type GroupColour,
  type Patch,
  type Project,
  RETURN_IN_TYPE,
  type SendLevels,
  TRACK_IN_TYPE,
  TRACK_OUT_TYPE,
  type Track,
  controlOwnerId,
  describeNode,
  mixesAfter,
  panOf,
} from '@core'
import { type SubjectOf, openTrackView, runAction, useProjectStore, useSelectionStore } from '@state'
import { useControlGesture } from '../controls/use-control-gesture'
import { EffectiveValue } from '../controls/EffectiveValue'
import { MuteSolo, useRoute } from '../shared/MuteSolo'
import { LevelBar } from './LevelBar'
import styles from './Mixer.module.css'

/** Everything in a graph except where the sound comes in and goes out counts as an effect. */
const ENDS = new Set([TRACK_IN_TYPE, TRACK_OUT_TYPE, RETURN_IN_TYPE, GROUP_IN_TYPE])

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

/** The names of a graph's effects, for the fx badge. */
export const useEffectLabels = (fx: Patch): string[] => {
  const modules = useProjectStore((state) => state.project.modules)
  return fx.nodes.filter((node) => !ENDS.has(node.type)).map((node) => describeNode(node, modules)?.label ?? node.type)
}

/**
 * What a strip's controls need from whose they are: a track's, or a group bus's. The two strips draw the same parts
 * through it.
 */
export interface StripOwner {
  readonly owner: Extract<ControlOwner, { kind: 'track' | 'group' }>
  readonly name: string
  readonly volume: number
  readonly pan: number
  /** Absent for a return, which has no send knobs. */
  readonly sends?: SendLevels
}

const mixerTarget = (owner: ControlOwner, control: 'volume' | 'pan'): ControlTarget => ({ kind: 'mixer', owner, control })

/** Pan, with its readout: C, L 30, R 100. */
export const PanControl = ({ strip }: { strip: StripOwner }) => {
  const gesture = useControlGesture()
  const target = mixerTarget(strip.owner, 'pan')
  const setPan = (value: number) => gesture.change([{ target, value }])
  const { pan } = strip
  return (
    <label className={styles.pan} title="Pan (double-click to centre)" {...gesture.events}>
      <span>{pan === 0 ? 'C' : pan < 0 ? `L${Math.round(-pan * 100)}` : `R${Math.round(pan * 100)}`}</span>
      <ActionMenu subject={{ kind: 'control', targets: [target] }}><input
        type="range"
        min={-1}
        max={1}
        step={0.01}
        value={pan}
        aria-label={`${strip.name} pan`}
        onChange={(event) => setPan(Number(event.target.value))}
        onDoubleClick={() => setPan(0)}
      /></ActionMenu>
      <EffectiveValue target={target} />
    </label>
  )
}

/** One post-fader knob per return; a knob that would make the mix loop is disabled. */
export const SendKnobs = ({ strip }: { strip: StripOwner }) => {
  const gesture = useControlGesture()
  const modules = useProjectStore((state) => state.project.modules)
  const tracks = useProjectStore((state) => state.project.tracks)
  const groups = useProjectStore((state) => state.project.groups)
  const returns = tracks.filter((candidate) => candidate.kind === 'return')
  const id = controlOwnerId(strip.owner)!
  if (!strip.sends || returns.length === 0) return null
  const sends = strip.sends
  const sendTarget = (returnId: string): ControlTarget => ({ kind: 'mixer', owner: strip.owner, control: 'send', returnId })
  return (
    <div className={styles.sends} role="group" aria-label={`${strip.name} sends`} {...gesture.events}>
      {returns.map((target) => {
        // A channel that takes audio from a return cannot send to it as well: that would be a loop.
        const loop = mixesAfter({ tracks, groups, modules }, id, target.id)
        const title = loop
          ? `${strip.name} takes audio from ${target.name}, so it cannot send to it`
          : `Send to ${target.name} (post-fader: after the effects and the volume)`
        return (
          <label key={target.id} className={styles.send} title={title}>
            <span>{target.name}</span>
            <ActionMenu subject={{ kind: 'control', targets: [sendTarget(target.id)] }}><input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={sends[target.id] ?? 0}
              aria-label={`${strip.name} send to ${target.name}`}
              disabled={loop}
              onChange={(event) => gesture.change([{ target: sendTarget(target.id), value: Number(event.target.value) }])}
            /></ActionMenu>
            <EffectiveValue target={sendTarget(target.id)} />
          </label>
        )
      })}
    </div>
  )
}

/** The fader, the level meter beside it, and the value under it. */
export const FaderRow = ({ strip }: { strip: StripOwner }) => {
  const gesture = useControlGesture()
  const target = mixerTarget(strip.owner, 'volume')
  const id = controlOwnerId(strip.owner)!
  return (
    <>
      <div className={styles.faderRow} {...gesture.events}>
        <ActionMenu subject={{ kind: 'control', targets: [target] }}><input
          className={styles.fader}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={strip.volume}
          aria-label={`${strip.name} fader`}
          aria-orientation="vertical"
          onChange={(event) => gesture.change([{ target, value: Number(event.target.value) }])}
        /></ActionMenu>
        <LevelBar label={`${strip.name} level`} read={(status) => status.peaks[id] ?? 0} />
      </div>
      <EffectiveValue target={target} />
      <output className={styles.value}>{Math.round(strip.volume * 100)}</output>
    </>
  )
}

/** Where a channel sums into, for the line under its name: a bus's group, or the master. */
export const outputName = (project: Project, route: ChannelRoute): string =>
  route.output === null ? 'Master' : project.groups?.find((group) => group.id === route.output)?.name ?? 'Master'

/** The line under a strip's name: where it sums into, when that is a bus (always, for a bus). */
export const OutputLine = ({ route, always }: { route: ChannelRoute; always?: boolean }) => {
  const name = useProjectStore((state) => outputName(state.project, route))
  if (route.output === null && !always) return null
  return <span className={styles.output} title={`Sums into ${name}`}>→ {name}</span>
}

/** One track in the mixer: pan, sends, mute and solo, the fader and the track's own level meter. `stripe`: its group's colour. */
export const ChannelStrip = ({ track, stripe }: { track: Track; stripe?: GroupColour }) => {
  const selected = useSelectionStore((state) => state.trackId === track.id)
  const selectTrack = useSelectionStore((state) => state.selectTrack)
  const route = useRoute(track.id)
  const subject: SubjectOf<'track'> = { kind: 'track', trackId: track.id }
  // A preset or a library graph dropped here goes onto this track; a track or a group lands on the side it is over.
  const drop = useEdgeTarget(subject, 'x')
  // The name drags the track: the sliders keep their own gestures.
  const drag = useDragSource(useRenaming(subject) ? null : subject)
  const context = useActionContext()
  const labels = useEffectLabels(track.fx)
  const strip: StripOwner = {
    owner: { kind: 'track', trackId: track.id },
    name: track.name,
    volume: track.volume,
    pan: panOf(track),
    ...(track.kind !== 'return' && { sends: track.sends }),
  }

  return (
    <ActionMenu subject={subject}>
    <section
      {...drop}
      style={stripe && ({ '--group': `var(--group-${stripe})` } as CSSProperties)}
      data-stripe={stripe}
      className={`${styles.strip} ${selected ? styles.selected : ''} ${track.kind === 'return' ? styles.returnStrip : ''} ${route.muted ? styles.mutedStrip : ''}`}
      aria-label={`${track.name} channel`}
    >
      <InPlaceRename subject={subject} name={track.name} label={`Name of ${track.name}`} className={styles.name}>
        <button className={styles.name} onClick={() => selectTrack(track.id)} title={`Select ${track.name}`} {...drag}>
          {track.name}
          {track.kind !== 'instrument' && <span className={styles.kind}> {track.kind}</span>}
        </button>
      </InPlaceRename>
      <OutputLine route={route} />
      <div className={styles.badges}>
        <EffectsBadge name={track.name} labels={labels} onOpen={() => openTrackView(track.id, 'effects')} />
      </div>
      <PanControl strip={strip} />
      <SendKnobs strip={strip} />
      <MuteSolo
        kind="track"
        name={track.name}
        muted={track.muted === true}
        soloed={track.soloed === true}
        route={route}
        onMute={() => runAction('track.mute', subject, context)}
        onSolo={() => runAction('track.solo', subject, context)}
      />
      <FaderRow strip={strip} />
    </section>
    </ActionMenu>
  )
}
