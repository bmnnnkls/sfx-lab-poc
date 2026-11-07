import { trackRows, visibleRows } from '@core'
import { type Subject, runAction, useProjectStore, useSelectionStore } from '@state'
import { type CSSProperties, Fragment, type ReactNode, useMemo, useRef } from 'react'
import { type GroupedColumn, bandsOf, groupedColumns, stripeOf } from '../shared/group-columns'
import { Icon } from '../shared/icon'
import { ActionMenu, PopupMenu, useActionContext } from '../shared/menu'
import { InPlaceRename } from '../shared/RenameField'
import { revealKey, useRevealRequest } from '../shared/reveal'
import { AutomationSlotCell } from './AutomationSlotCell'
import { ClipSlot } from './ClipSlot'
import { CollapsedGroupHeader, GroupBand, GroupCell, GroupVolume, HiddenTracks } from './GroupHeader'
import { MasterHeader } from './MasterHeader'
import styles from './SessionView.module.css'
import { TrackHeader } from './TrackHeader'

/**
 * The clip-launcher grid: tracks as columns, scenes as rows. It scrolls in its own scroller, under track headers that
 * stay at the top and a scene column that stays at the right, so tracks can be named and scenes launched anywhere.
 * An expanded group is a band over its members' headers, one row of bands per level; a collapsed group is one column
 * whose cells launch its members. Hidden tracks have no column. The selected track's column is lighter (so is a collapsed
 * group's that holds it, and every column of a selected group), and choosing a row in the Tracks view scrolls its column
 * into view.
 */
export const SessionView = () => {
  const rows = useProjectStore((state) => visibleRows(trackRows(state.project)))
  const columns = useMemo(() => groupedColumns(rows), [rows])
  const bands = useMemo(() => bandsOf(columns), [columns])
  const sceneCount = useProjectStore((state) => state.project.sceneCount)
  const addTrack = useProjectStore((state) => state.addTrack)
  const addAudioTrack = useProjectStore((state) => state.addAudioTrack)
  const addReturnTrack = useProjectStore((state) => state.addReturnTrack)
  const scroller = useRef<HTMLDivElement>(null)
  useRevealRequest(scroller)
  const selectedTrack = useSelectionStore((state) => state.trackId)
  const selectedGroup = useSelectionStore((state) => state.groupId)
  const masterSelected = useSelectionStore((state) => state.master)
  const selected = useMemo(() => {
    const inSelectedGroup = (column: GroupedColumn) => column.groups.some((group) => group.group.id === selectedGroup)
    return new Set(
      columns.flatMap((column) => {
        const { row } = column
        const on =
          inSelectedGroup(column) ||
          (row.kind === 'track' ? row.track.id === selectedTrack : row.group.id === selectedGroup || (selectedTrack !== null && row.trackIds.includes(selectedTrack)))
        return on ? [columnKey(column)] : []
      }),
    )
  }, [columns, selectedTrack, selectedGroup])

  // The columns, then the master, then the scenes; `--track-min` narrows the columns in a narrow view.
  const template = `repeat(var(--columns), minmax(var(--track-min), 1fr)) 56px`

  return (
    <div className={styles.scroller} data-scroll="both" ref={scroller}>
      <div className={styles.grid} style={{ gridTemplateColumns: template, '--columns': columns.length + 1, '--bands': bands.length } as CSSProperties}>
        {bands.map((level, index) => (
          <Fragment key={index}>
            {level.map((band, at) =>
              band.group ? (
                <div key={band.group.group.id} className={styles.bandCell} data-reveal={revealKey('group', band.group.group.id)} style={{ gridColumn: `span ${band.span}`, '--level': index } as CSSProperties}>
                  <GroupBand group={band.group.group} trackIds={band.group.trackIds}>
                    <GroupVolume group={band.group.group} />
                  </GroupBand>
                </div>
              ) : (
                <div key={`gap-${at}`} className={styles.bandCell} style={{ gridColumn: `span ${band.span}`, '--level': index } as CSSProperties} />
              ),
            )}
            <div className={styles.bandCell} style={{ gridColumn: 'span 2', '--level': index } as CSSProperties} />
          </Fragment>
        ))}
        {columns.map((column) => (
          <Column key={columnKey(column)} column={column} selected={selected}>
            {column.row.kind === 'track' ? (
              <TrackHeader track={column.row.track} stripe={stripeOf(column)} />
            ) : (
              <CollapsedGroupHeader group={column.row.group} trackIds={column.row.trackIds} />
            )}
          </Column>
        ))}
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
          <SceneRow key={scene} scene={scene} columns={columns} selected={selected} masterSelected={masterSelected} />
        ))}
      </div>
    </div>
  )
}

const columnKey = ({ row }: GroupedColumn): string => (row.kind === 'track' ? revealKey('track', row.track.id) : revealKey('group', row.group.id))

/**
 * One column's header or cell, in a wrapper that draws nothing (`display: contents`, so the grid still places the
 * cell) and marks it: `data-reveal` for a reveal request, `data-selected` for the selected column's background.
 */
const Column = ({ column, selected, children }: { column: GroupedColumn; selected: ReadonlySet<string>; children: ReactNode }) => {
  const key = columnKey(column)
  return (
    <div className={styles.column} data-reveal={key} data-selected={selected.has(key) || undefined}>
      {children}
    </div>
  )
}

const SceneRow = ({ scene, columns, selected, masterSelected }: { scene: number; columns: readonly GroupedColumn[]; selected: ReadonlySet<string>; masterSelected: boolean }) => {
  const context = useActionContext()
  const subject: Subject = { kind: 'scene', scene }
  const name = useProjectStore((state) => state.project.sceneNames?.[scene])
  return (
    <>
      {columns.map((column) => (
        <Column key={columnKey(column)} column={column} selected={selected}>
          {column.row.kind === 'track' ? (
            <ClipSlot track={column.row.track} scene={scene} />
          ) : (
            <GroupCell group={column.row.group} trackIds={column.row.trackIds} scene={scene} />
          )}
        </Column>
      ))}
      <div className={styles.column} data-selected={masterSelected || undefined}>
        <AutomationSlotCell owner={{ kind: 'master' }} scene={scene} />
      </div>
      <InPlaceRename subject={subject} name={name ?? ''} label={`Name of scene ${scene + 1}`} className={styles.scene}>
        <ActionMenu subject={subject}>
        <button className={styles.scene} onClick={() => runAction('scene.launch', subject, context)} aria-label={name ? `Launch scene ${scene + 1}, ${name}` : `Launch scene ${scene + 1}`} title={name || undefined}>
          <span><Icon name="play" filled size={14} /> {scene + 1}</span>
          {name && <small className={styles.sceneName}>{name}</small>}
        </button>
        </ActionMenu>
      </InPlaceRename>
    </>
  )
}
