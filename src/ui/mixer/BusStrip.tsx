import type { CSSProperties } from 'react'
import type { GroupBus, TrackGroup } from '@core'
import { type SubjectOf, openGroupEffects, useProjectStore, useSelectionStore } from '@state'
import { useDragSource, useEdgeTarget } from '../shared/drag'
import { ActionMenu } from '../shared/menu'
import { InPlaceRename, useRenaming } from '../shared/RenameField'
import { GroupMuteSolo, useRoute } from '../shared/MuteSolo'
import { EffectsBadge, FaderRow, OutputLine, PanControl, SendKnobs, type StripOwner, useEffectLabels } from './ChannelStrip'
import styles from './Mixer.module.css'

const colourOf = (group: TrackGroup) => ({ '--group': `var(--group-${group.colour})` }) as CSSProperties

/** The twisty that folds a group's strips away in every view, or unfolds them. */
const Twisty = ({ group }: { group: TrackGroup }) => (
  <button
    className={styles.twisty}
    aria-label={`${group.collapsed ? 'Expand' : 'Collapse'} ${group.name}`}
    aria-expanded={!group.collapsed}
    onClick={() => useProjectStore.getState().setGroupCollapsed(group.id, !group.collapsed)}
  >
    {group.collapsed ? '▸' : '▾'}
  </button>
)

/** The group's name: selects it, drags it, renamed in place. */
const GroupName = ({ group }: { group: TrackGroup }) => {
  const subject: SubjectOf<'group'> = { kind: 'group', groupId: group.id }
  const drag = useDragSource(useRenaming(subject) ? null : subject)
  const select = () => useSelectionStore.getState().selectGroup(group.id)
  return (
    <InPlaceRename subject={subject} name={group.name} label={`Name of ${group.name}`} className={styles.name}>
      <button className={styles.name} onClick={select} title={`Select ${group.name}`} {...drag}>
        {group.name}
      </button>
    </InPlaceRename>
  )
}

/**
 * A group's bus as a strip before its members, as a group track sits before its tracks: the name, where it sums into,
 * the fx badge, pan, sends, M, S, the fader and the meter. Collapsed, it stands for the whole group, with a twisty.
 */
export const BusStrip = ({ group, bus, count }: { group: TrackGroup; bus: GroupBus; count: number }) => {
  const selected = useSelectionStore((state) => state.groupId === group.id)
  const route = useRoute(group.id)
  const subject: SubjectOf<'group'> = { kind: 'group', groupId: group.id }
  // Presets and library effects land on the bus; a track or a group on the side it is over.
  const drop = useEdgeTarget(subject, 'x')
  const labels = useEffectLabels(bus.fx)
  const strip: StripOwner = { owner: { kind: 'group', groupId: group.id }, name: group.name, volume: bus.volume, pan: bus.pan ?? 0, sends: bus.sends }
  return (
    <ActionMenu subject={subject}>
      <section
        {...drop}
        style={colourOf(group)}
        className={`${styles.strip} ${styles.busStrip} ${selected ? styles.selected : ''} ${route.muted ? styles.mutedStrip : ''}`}
        aria-label={`${group.name} bus${group.collapsed ? `, collapsed, ${count} track${count === 1 ? '' : 's'}` : ''}`}
      >
        <div className={styles.busTitle}>
          {group.collapsed && <Twisty group={group} />}
          <GroupName group={group} />
        </div>
        <OutputLine route={route} always />
        <div className={styles.badges}>
          <EffectsBadge name={group.name} labels={labels} onOpen={() => openGroupEffects(group.id)} />
        </div>
        <PanControl strip={strip} />
        <SendKnobs strip={strip} />
        <GroupMuteSolo group={group} />
        <FaderRow strip={strip} />
      </section>
    </ActionMenu>
  )
}

/** A collapsed folder: its name, how many tracks it has, and its M and S. */
export const GroupStrip = ({ group, count }: { group: TrackGroup; count: number }) => {
  const subject: SubjectOf<'group'> = { kind: 'group', groupId: group.id }
  const drop = useEdgeTarget(subject, 'x')
  const drag = useDragSource(useRenaming(subject) ? null : subject)
  return (
    <ActionMenu subject={subject}>
      <section className={`${styles.strip} ${styles.groupStrip}`} style={colourOf(group)} aria-label={`${group.name} group, collapsed`} {...drop}>
        <Twisty group={group} />
        <InPlaceRename subject={subject} name={group.name} label={`Name of ${group.name}`} className={styles.name}>
          <span className={styles.name} {...drag} title={group.name}>{group.name}</span>
        </InPlaceRename>
        <span className={styles.kind}>{count} track{count === 1 ? '' : 's'}</span>
        <GroupMuteSolo group={group} />
      </section>
    </ActionMenu>
  )
}
