import { trackRows, visibleRows } from '@core'
import { type Subject, runAction, useProjectStore } from '@state'
import { type CSSProperties, Fragment, useMemo } from 'react'
import { type GroupedColumn, bandsOf, groupedColumns, stripeOf } from '../shared/group-columns'
import { ActionMenu, PopupMenu, useActionContext } from '../shared/menu'
import { InPlaceRename } from '../shared/RenameField'
import { AutomationSlotCell } from './AutomationSlotCell'
import { ClipSlot } from './ClipSlot'
import { CollapsedGroupHeader, GroupBand, GroupCell, HiddenTracks } from './GroupHeader'
import { MasterHeader } from './MasterHeader'
import styles from './SessionView.module.css'
import { TrackHeader } from './TrackHeader'

/**
 * The clip-launcher grid: tracks as columns, scenes as rows. It scrolls in its own scroller, under track headers that
 * stay at the top and a scene column that stays at the right, so tracks can be named and scenes launched anywhere.
 * An expanded group is a band over its members' headers, one row of bands per level; a collapsed group is one column
 * whose cells launch its members. Hidden tracks have no column.
 */
export const SessionView = () => {
  const rows = useProjectStore((state) => visibleRows(trackRows(state.project)))
  const columns = useMemo(() => groupedColumns(rows), [rows])
  const bands = useMemo(() => bandsOf(columns), [columns])
  const sceneCount = useProjectStore((state) => state.project.sceneCount)
  const addTrack = useProjectStore((state) => state.addTrack)
  const addAudioTrack = useProjectStore((state) => state.addAudioTrack)
  const addReturnTrack = useProjectStore((state) => state.addReturnTrack)

  // The columns, then the master, then the scenes; `--track-min` narrows the columns in a narrow view.
  const template = `repeat(var(--columns), minmax(var(--track-min), 1fr)) 56px`

  return (
    <div className={styles.scroller} data-scroll="both">
      <div className={styles.grid} style={{ gridTemplateColumns: template, '--columns': columns.length + 1, '--bands': bands.length } as CSSProperties}>
        {bands.map((level, index) => (
          <Fragment key={index}>
            {level.map((band, at) =>
              band.group ? (
                <div key={band.group.group.id} className={styles.bandCell} style={{ gridColumn: `span ${band.span}`, '--level': index } as CSSProperties}>
                  <GroupBand group={band.group.group} trackIds={band.group.trackIds} />
                </div>
              ) : (
                <div key={`gap-${at}`} className={styles.bandCell} style={{ gridColumn: `span ${band.span}`, '--level': index } as CSSProperties} />
              ),
            )}
            <div className={styles.bandCell} style={{ gridColumn: 'span 2', '--level': index } as CSSProperties} />
          </Fragment>
        ))}
        {columns.map((column) =>
          column.row.kind === 'track' ? (
            <TrackHeader key={column.row.track.id} track={column.row.track} stripe={stripeOf(column)} />
          ) : (
            <CollapsedGroupHeader key={column.row.group.id} group={column.row.group} trackIds={column.row.trackIds} />
          ),
        )}
        <MasterHeader />
        <div className={styles.corner}>
          <PopupMenu
            entries={[
              { label: 'Instrument track', onSelect: addTrack },
              { label: 'Audio track', onSelect: addAudioTrack },
              { label: 'Return track', onSelect: addReturnTrack },
            ]}
          >
            <button className={styles.addTrack} aria-label="Add track">
              +
            </button>
          </PopupMenu>
          <HiddenTracks />
        </div>

        {Array.from({ length: sceneCount }, (_, scene) => (
          <SceneRow key={scene} scene={scene} columns={columns} />
        ))}
      </div>
    </div>
  )
}

const SceneRow = ({ scene, columns }: { scene: number; columns: readonly GroupedColumn[] }) => {
  const context = useActionContext()
  const subject: Subject = { kind: 'scene', scene }
  const name = useProjectStore((state) => state.project.sceneNames?.[scene])
  return (
    <>
      {columns.map(({ row }) =>
        row.kind === 'track' ? (
          <ClipSlot key={row.track.id} track={row.track} scene={scene} />
        ) : (
          <GroupCell key={row.group.id} group={row.group} trackIds={row.trackIds} scene={scene} />
        ),
      )}
      <AutomationSlotCell owner={{ kind: 'master' }} scene={scene} />
      <InPlaceRename subject={subject} name={name ?? ''} label={`Name of scene ${scene + 1}`} className={styles.scene}>
        <ActionMenu subject={subject}>
        <button className={styles.scene} onClick={() => runAction('scene.launch', subject, context)} aria-label={name ? `Launch scene ${scene + 1}, ${name}` : `Launch scene ${scene + 1}`} title={name || undefined}>
          <span>▶ {scene + 1}</span>
          {name && <small className={styles.sceneName}>{name}</small>}
        </button>
        </ActionMenu>
      </InPlaceRename>
    </>
  )
}
