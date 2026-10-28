import { type TrackGroup, trackRows, visibleRows } from '@core'
import { type SubjectOf, useProjectStore } from '@state'
import { type CSSProperties, Fragment, useMemo } from 'react'
import { GroupBand } from '../session-view/GroupHeader'
import { useDragSource, useEdgeTarget } from '../shared/drag'
import { bandsOf, groupedColumns, stripeOf } from '../shared/group-columns'
import { ActionMenu } from '../shared/menu'
import { InPlaceRename, useRenaming } from '../shared/RenameField'
import { ChannelStrip } from './ChannelStrip'
import { MasterStrip } from './MasterStrip'
import styles from './Mixer.module.css'

/**
 * The "Mixer" tab: a channel strip for every track, then the return tracks, then the master, in the order the sound
 * flows (the same order as the session grid). The strips scroll sideways; the master stays at the right edge. An
 * expanded group is a band over its members' strips; a collapsed group is one narrow strip. Hidden tracks have none.
 */
export const MixerPanel = () => {
  const rows = useProjectStore((state) => visibleRows(trackRows(state.project)))
  const columns = useMemo(() => groupedColumns(rows), [rows])
  const bands = useMemo(() => bandsOf(columns), [columns])
  const layout: CSSProperties = {
    gridTemplateColumns: [...columns.map((column) => (column.row.kind === 'group' ? '72px' : '120px')), 'minmax(120px, 1fr)'].join(' '),
    gridTemplateRows: `repeat(${bands.length}, 26px) minmax(0, 1fr)`,
  }

  return (
    <div className={styles.mixer} data-scroll="x" style={layout}>
      {bands.map((level, index) => (
        <Fragment key={index}>
          {level.map((band, at) => (
            <div key={band.group?.group.id ?? `gap-${at}`} style={{ gridColumn: `span ${band.span}` }}>
              {band.group && <GroupBand group={band.group.group} trackIds={band.group.trackIds} />}
            </div>
          ))}
          <div />
        </Fragment>
      ))}
      {columns.map((column) =>
        column.row.kind === 'track' ? (
          <ChannelStrip key={column.row.track.id} track={column.row.track} stripe={stripeOf(column)} />
        ) : (
          <GroupStrip key={column.row.group.id} group={column.row.group} count={column.row.trackIds.length} />
        ),
      )}
      <MasterStrip />
    </div>
  )
}

/** A collapsed group: its name and how many tracks it has. Its fader comes with its bus (round 8). */
const GroupStrip = ({ group, count }: { group: TrackGroup; count: number }) => {
  const subject: SubjectOf<'group'> = { kind: 'group', groupId: group.id }
  const drop = useEdgeTarget(subject, 'x')
  const drag = useDragSource(useRenaming(subject) ? null : subject)
  return (
    <ActionMenu subject={subject}>
      <section
        className={`${styles.strip} ${styles.groupStrip}`}
        style={{ '--group': `var(--group-${group.colour})` } as CSSProperties}
        aria-label={`${group.name} group, collapsed`}
        {...drop}
      >
        <button className={styles.twisty} aria-label={`Expand ${group.name}`} aria-expanded={false} onClick={() => useProjectStore.getState().setGroupCollapsed(group.id, false)}>
          ▸
        </button>
        <InPlaceRename subject={subject} name={group.name} label={`Name of ${group.name}`} className={styles.name}>
          <span className={styles.name} {...drag} title={group.name}>{group.name}</span>
        </InPlaceRename>
        <span className={styles.kind}>{count} track{count === 1 ? '' : 's'}</span>
      </section>
    </ActionMenu>
  )
}
