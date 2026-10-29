import { trackRows, visibleRows } from '@core'
import { useProjectStore } from '@state'
import { type CSSProperties, Fragment, useMemo } from 'react'
import { GroupBand } from '../session-view/GroupHeader'
import { bandsOf, groupedColumns, stripeOf } from '../shared/group-columns'
import { BusStrip, GroupMuteSolo, GroupStrip } from './BusStrip'
import { ChannelStrip } from './ChannelStrip'
import { MasterStrip } from './MasterStrip'
import styles from './Mixer.module.css'

/**
 * The "Mixer" tab: a channel strip for every track, then the return tracks, then the master, in the order the sound
 * flows (the same order as the session grid). The strips scroll sideways; the master stays at the right edge. An
 * expanded group is a band over its members' strips, with its bus's strip first; a collapsed group is one strip, its
 * bus's or a narrow one for a folder. Hidden tracks have none.
 */
export const MixerPanel = () => {
  const rows = useProjectStore((state) => visibleRows(trackRows(state.project)))
  const columns = useMemo(() => groupedColumns(rows, { buses: true }), [rows])
  const bands = useMemo(() => bandsOf(columns), [columns])
  const layout: CSSProperties = {
    gridTemplateColumns: [...columns.map((column) => (column.row.kind === 'group' && !column.row.group.bus ? '72px' : '120px')), 'minmax(120px, 1fr)'].join(' '),
    gridTemplateRows: `repeat(${bands.length}, 26px) minmax(0, 1fr)`,
  }

  return (
    <div className={styles.mixer} data-scroll="x" style={layout}>
      {bands.map((level, index) => (
        <Fragment key={index}>
          {level.map((band, at) => (
            <div key={band.group?.group.id ?? `gap-${at}`} style={{ gridColumn: `span ${band.span}` }}>
              {band.group && (
                <GroupBand group={band.group.group} trackIds={band.group.trackIds}>
                  {/* A folder has no strip while expanded, so its band has the M and S; a bus's strip has them. */}
                  {!band.group.group.bus && <GroupMuteSolo group={band.group.group} compact />}
                </GroupBand>
              )}
            </div>
          ))}
          <div />
        </Fragment>
      ))}
      {columns.map((column) =>
        column.row.kind === 'track' ? (
          <ChannelStrip key={column.row.track.id} track={column.row.track} stripe={stripeOf(column)} />
        ) : column.row.group.bus ? (
          <BusStrip key={column.row.group.id} group={column.row.group} bus={column.row.group.bus} count={column.row.trackIds.length} />
        ) : (
          <GroupStrip key={column.row.group.id} group={column.row.group} count={column.row.trackIds.length} />
        ),
      )}
      <MasterStrip />
    </div>
  )
}
