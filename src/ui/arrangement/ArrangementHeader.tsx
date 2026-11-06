import type { ArrangementRow, GroupColour, Track, TrackGroup } from '@core'
import { type SubjectOf, runAction, useProjectStore, useSelectionStore } from '@state'
import type { CSSProperties } from 'react'
import { useDragSource, useEdgeTarget } from '../shared/drag'
import { ActionMenu, useActionContext } from '../shared/menu'
import { ArmButton } from '../shared/ArmButton'
import { GroupMuteSolo, MuteSolo, useRoute } from '../shared/MuteSolo'
import { LanesTwisty } from './LanesTwisty'
import styles from './arrangement.module.css'

/**
 * A track's header, at the left of its lane while the timeline scrolls: its name (clicking selects the track, as the
 * session header and the mixer strip do; the selected one is marked), M and S, and an instrument's arm ●. It carries the track's menu, drags to
 * reorder, and takes a preset or a library graph dropped on it.
 */
export const TrackHeader = ({ track, depth, stripe, owner = false }: { track: Track; depth: number; stripe?: GroupColour; owner?: boolean }) => {
  const subject: SubjectOf<'track'> = { kind: 'track', trackId: track.id }
  const context = useActionContext()
  // A track or a group dragged here lands above or below it.
  const drop = useEdgeTarget(subject, 'y')
  const drag = useDragSource(subject)
  const selected = useSelectionStore((state) => state.trackId === track.id)
  const route = useRoute(track.id)
  return (
    <ActionMenu subject={subject}>
      <div
        className={`${styles.header} ${owner ? styles.ownerHeader : ''} ${selected ? styles.selectedHeader : ''} ${route.muted ? styles.mutedHeader : ''}`}
        style={{ paddingInlineStart: 8 + depth * 10, '--twisty-left': `${depth * 10 + 2}px`, ...(stripe && { '--group': `var(--group-${stripe})` }) } as CSSProperties}
        data-stripe={stripe}
        {...drop}
        {...drag}
      >
        <LanesTwisty owner={{ kind: 'track', trackId: track.id }} name={track.name} corner={!owner} />
        <span
          className={styles.headerName}
          tabIndex={0}
          aria-current={selected || undefined}
          onClick={() => useSelectionStore.getState().selectTrack(track.id)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') useSelectionStore.getState().selectTrack(track.id)
          }}
        >
          {track.name}
        </span>
        <MuteSolo
          kind="track"
          compact
          name={track.name}
          muted={track.muted === true}
          soloed={track.soloed === true}
          route={route}
          onMute={() => runAction('track.mute', subject, context)}
          onSolo={() => runAction('track.solo', subject, context)}
        />
        {track.kind === 'instrument' && <ArmButton trackId={track.id} name={track.name} className={styles.headerArm} />}
      </div>
    </ActionMenu>
  )
}

/** A group's header: its twisty (folding its members' lanes away), its name, a *bus* tag for a bus, M and S. */
export const GroupHeader = ({ group, depth }: { group: TrackGroup; depth: number }) => {
  const subject: SubjectOf<'group'> = { kind: 'group', groupId: group.id }
  const drop = useEdgeTarget(subject, 'y')
  const drag = useDragSource(subject)
  const selected = useSelectionStore((state) => state.groupId === group.id)
  const muted = useRoute(group.bus ? group.id : (group.parentId ?? '')).muted || group.muted === true
  return (
    <ActionMenu subject={subject}>
      <div
        className={`${styles.header} ${styles.groupHeader} ${selected ? styles.selectedHeader : ''} ${muted ? styles.mutedHeader : ''}`}
        style={{ paddingInlineStart: 4 + depth * 10, '--group': `var(--group-${group.colour})` } as CSSProperties}
        role="group"
        aria-label={`Group ${group.name}${group.collapsed ? ', collapsed' : ''}`}
        {...drop}
        {...drag}
      >
        <button
          className={styles.twisty}
          aria-label={`${group.collapsed ? 'Expand' : 'Collapse'} ${group.name}`}
          aria-expanded={!group.collapsed}
          onClick={() => useProjectStore.getState().setGroupCollapsed(group.id, !group.collapsed)}
        >
          {group.collapsed ? '▸' : '▾'}
        </button>
        {group.bus && <LanesTwisty owner={{ kind: 'group', groupId: group.id }} name={group.name} />}
        <span className={styles.headerName} onClick={() => useSelectionStore.getState().selectGroup(group.id)}>
          {group.name}
        </span>
        {group.bus && <span className={styles.busTag}>bus</span>}
        <GroupMuteSolo group={group} compact />
      </div>
    </ActionMenu>
  )
}

/** The master's header: its lanes twisty and its name, which selects it; the master's menu. */
export const MasterHeader = () => {
  const selected = useSelectionStore((state) => state.master)
  return (
    <ActionMenu subject={{ kind: 'master' }}>
      <div className={`${styles.header} ${styles.ownerHeader} ${selected ? styles.selectedHeader : ''}`}>
        <LanesTwisty owner={{ kind: 'master' }} name="Master" />
        <span
          className={styles.headerName}
          tabIndex={0}
          aria-current={selected || undefined}
          onClick={() => useSelectionStore.getState().selectMaster()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') useSelectionStore.getState().selectMaster()
          }}
        >
          Master
        </span>
      </div>
    </ActionMenu>
  )
}

/** The header a row of the timeline has. */
export const ArrangementHeader = ({ row }: { row: ArrangementRow }) =>
  row.kind === 'group' ? <GroupHeader group={row.group} depth={row.depth} />
    : row.kind === 'master' ? <MasterHeader />
    : <TrackHeader track={row.track} depth={row.depth} stripe={row.kind === 'track' ? row.stripe : undefined} owner={row.kind === 'return'} />
