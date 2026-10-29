import type { Project, TrackGroup } from '@core'
import { type SubjectOf, useEngineControls, useLayoutStore, useProjectStore, useStatusStore } from '@state'
import type { CSSProperties, ReactNode } from 'react'
import { useDragSource, useEdgeTarget } from '../shared/drag'
import { ActionMenu } from '../shared/menu'
import { InPlaceRename, useRenaming } from '../shared/RenameField'
import { useSounding } from '../shared/use-sounding'
import styles from './SessionView.module.css'

interface GroupProps {
  readonly group: TrackGroup
  /** Every track in it, nested groups' and hidden ones included. */
  readonly trackIds: readonly string[]
}

const colourOf = (group: TrackGroup) => ({ '--group': `var(--group-${group.colour})` }) as CSSProperties

/** The twisty, colour and name of a group: draggable, renamed in place, with the group's menu. */
const GroupTitle = ({ group, count }: { group: TrackGroup; count: number }) => {
  const subject: SubjectOf<'group'> = { kind: 'group', groupId: group.id }
  const drag = useDragSource(useRenaming(subject) ? null : subject)
  return (
    <>
      <button
        className={styles.twisty}
        aria-label={`${group.collapsed ? 'Expand' : 'Collapse'} ${group.name}`}
        aria-expanded={!group.collapsed}
        onClick={() => useProjectStore.getState().setGroupCollapsed(group.id, !group.collapsed)}
      >
        {group.collapsed ? '▸' : '▾'}
      </button>
      <InPlaceRename subject={subject} name={group.name} label={`Name of ${group.name}`} className={styles.groupName}>
        <span className={styles.groupName} {...drag} title={`${group.name}: ${count} track${count === 1 ? '' : 's'}`}>
          {group.name}
        </span>
      </InPlaceRename>
    </>
  )
}

/**
 * An expanded group, as a band over its members' headers. A track or group dropped on its middle third goes inside.
 * `children` are drawn after the title: the mixer's M and S for a folder.
 */
export const GroupBand = ({ group, trackIds, children }: GroupProps & { children?: ReactNode }) => {
  const subject: SubjectOf<'group'> = { kind: 'group', groupId: group.id }
  const drop = useEdgeTarget(subject, 'x')
  return (
    <ActionMenu subject={subject}>
      <div className={styles.band} style={colourOf(group)} role="group" aria-label={`Group ${group.name}`} {...drop}>
        <GroupTitle group={group} count={trackIds.length} />
        {children}
      </div>
    </ActionMenu>
  )
}

/** A collapsed group, as one column's header. */
export const CollapsedGroupHeader = ({ group, trackIds }: GroupProps) => {
  const subject: SubjectOf<'group'> = { kind: 'group', groupId: group.id }
  const drop = useEdgeTarget(subject, 'x')
  return (
    <ActionMenu subject={subject}>
      <div className={`${styles.header} ${styles.groupHeader}`} style={colourOf(group)} role="group" aria-label={`Group ${group.name}, collapsed`} {...drop}>
        <GroupTitle group={group} count={trackIds.length} />
        <span className={styles.groupCount}>{trackIds.length} track{trackIds.length === 1 ? '' : 's'}</span>
      </div>
    </ActionMenu>
  )
}

/** Each member's clip in a scene, by track id: what a collapsed group's cell launches. */
const sceneClips = (project: Project, trackIds: readonly string[], scene: number) =>
  trackIds.flatMap((id) => {
    const track = project.tracks.find((candidate) => candidate.id === id)
    const clip = track && track.kind !== 'return' ? track.clips[scene] : null
    return clip ? [{ trackId: id, clipId: clip.id }] : []
  })

/**
 * A collapsed group's cell in a scene: launches its members' clips in that scene and stops the members whose slot is
 * empty, as a scene launch does for every track. Marked while one of those clips plays or is queued.
 */
export const GroupCell = ({ group, trackIds, scene }: GroupProps & { scene: number }) => {
  const engine = useEngineControls()
  const clips = useProjectStore((state) => sceneClips(state.project, trackIds, scene).map((clip) => `${clip.trackId}:${clip.clipId}`).join())
  const state = useStatusStore((status) => {
    const launchers = status.status?.tracks
    if (!launchers || !clips) return ''
    const entries = clips.split(',').map((entry) => entry.split(':') as [string, string])
    if (entries.some(([trackId, clipId]) => launchers[trackId]?.playingClipId === clipId)) return 'playing'
    return entries.some(([trackId, clipId]) => launchers[trackId]?.queued === clipId) ? 'queued' : ''
  })
  const filled = clips !== ''
  return (
    <div className={`${styles.slot} ${styles.groupCell} ${filled ? '' : styles.empty} ${state ? styles[state] : ''}`} style={colourOf(group)}>
      <button
        onClick={() => engine.launchScene(scene, trackIds)}
        aria-label={filled ? `Launch ${group.name} in scene ${scene + 1}` : `Stop ${group.name} in scene ${scene + 1}`}
        data-state={state || undefined}
      >
        {filled ? '▶' : '■'}
      </button>
    </div>
  )
}

/** How many tracks are hidden, lit while one of them sounds. Shows the Tracks view, where they can be shown again. */
export const HiddenTracks = () => {
  const ids = useProjectStore((state) => state.project.tracks.filter((track) => track.hidden).map((track) => track.id).join())
  const hidden = ids ? ids.split(',') : []
  const sounding = useSounding(hidden)
  if (!hidden.length) return null
  return (
    <button
      className={`${styles.hiddenTracks} ${sounding ? styles.sounding : ''}`}
      aria-label={`${hidden.length} hidden track${hidden.length === 1 ? '' : 's'}${sounding ? ', sounding' : ''}`}
      title="Hidden tracks still play. Show them in the Tracks view."
      data-sounding={sounding || undefined}
      onClick={() => useLayoutStore.getState().revealView('tracks')}
    >
      ◌ {hidden.length}
    </button>
  )
}
