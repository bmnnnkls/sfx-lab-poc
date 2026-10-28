import {
  arrangementEnd,
  arrangementLoopEnd,
  arrangementOnTrack,
  type ArrangementClip,
  type GroupColour,
  type TrackGroup,
  type TrackRow,
  trackRows,
  visibleRows,
} from '@core'
import { type SubjectOf, useEngineControls, useLayoutStore, useProjectStore, useSelectionStore, useStatusStore } from '@state'
import { type CSSProperties, Fragment, type ReactNode, useMemo, useState } from 'react'
import { viewTitles } from '../layout/view-titles'
import { useDragSource, useDropTarget, useEdgeTarget } from '../shared/drag'
import { ActionMenu } from '../shared/menu'
import { useStoredState } from '../shared/use-stored-state'
import { ArrangementPlayhead } from './ArrangementPlayhead'
import { ArrangementRegion } from './ArrangementRegion'
import styles from './arrangement.module.css'

const BEATS_PER_BAR = 4
const DEFAULT_PX_PER_BEAT = 24
const MIN_PX_PER_BEAT = 8
const MAX_PX_PER_BEAT = 64
/** The timeline is at least this many bars, and always shows 4 empty bars past the last clip. */
const MIN_BARS = 32
const TRAILING_BARS = 4

const isZoom = (value: unknown): value is number =>
  typeof value === 'number' && value >= MIN_PX_PER_BEAT && value <= MAX_PX_PER_BEAT

/** Snap to sixteenth beats. */
const snap = (beats: number): number => Math.round(beats * 4) / 4

/** How to fill the timeline. Shown in the toolbar while it fits, and always its tooltip. */
const HINT =
  'Drag a session slot onto a lane, or right-click an empty lane to add a session clip; drag regions to move (across lanes too), the edge to resize.'

/** A lane's row: what is dropped on it lands at the snapped beat under the pointer, marked while it is over. */
const LaneRow = ({ trackId, pxPerBeat, width, children }: { trackId: string; pxPerBeat: number; width: number; children: ReactNode }) => {
  const drop = useDropTarget(
    (event) => ({ kind: 'lane', trackId, beat: snap(Math.max(0, (event.clientX - event.currentTarget.getBoundingClientRect().left) / pxPerBeat)) }),
    (event, target) => event.currentTarget.style.setProperty('--drop-at', `${(target.kind === 'lane' ? target.beat : 0) * pxPerBeat}px`),
  )
  return (
    <div className={styles.row} style={{ width }} {...drop}>
      {children}
    </div>
  )
}

/**
 * A lane's track name: clicking selects the track, as the session header and the mixer strip do, and the selected
 * one is marked. Its menu is the track's, and a preset or a library graph dropped on it goes onto the track.
 */
const LaneName = ({ trackId, name, depth, stripe }: { trackId: string; name: string; depth: number; stripe?: GroupColour }) => {
  const subject: SubjectOf<'track'> = { kind: 'track', trackId }
  // A track or a group dragged here lands above or below it.
  const drop = useEdgeTarget(subject, 'y')
  const drag = useDragSource(subject)
  const selected = useSelectionStore((state) => state.trackId === trackId)
  return (
    <ActionMenu subject={subject}>
      <div
        className={`${styles.name} ${selected ? styles.selectedName : ''}`}
        tabIndex={0}
        aria-current={selected || undefined}
        style={{ paddingInlineStart: 8 + depth * 10, ...(stripe && { '--group': `var(--group-${stripe})` }) } as CSSProperties}
        data-stripe={stripe}
        onClick={() => useSelectionStore.getState().selectTrack(trackId)}
        {...drop}
        {...drag}
      >
        {name}
      </div>
    </ActionMenu>
  )
}

/**
 * A group's lane: its twisty and name over the timeline, before its members' lanes. Collapsed, the members' lanes are
 * not drawn, and it shows where their regions are as thin bars.
 */
const GroupLane = ({ group, trackIds, depth, regions, pxPerBeat, width }: { group: TrackGroup; trackIds: readonly string[]; depth: number; regions: readonly ArrangementClip[]; pxPerBeat: number; width: number }) => {
  const subject: SubjectOf<'group'> = { kind: 'group', groupId: group.id }
  const drop = useEdgeTarget(subject, 'y')
  const drag = useDragSource(subject)
  const colour = { '--group': `var(--group-${group.colour})` } as CSSProperties
  const members = group.collapsed ? regions.filter((region) => trackIds.includes(region.trackId)) : []
  return (
    <div className={`${styles.lane} ${styles.groupLane}`} style={colour}>
      <ActionMenu subject={subject}>
        <div className={`${styles.name} ${styles.groupName}`} style={{ paddingInlineStart: 4 + depth * 10 }} role="group" aria-label={`Group ${group.name}${group.collapsed ? ', collapsed' : ''}`} {...drop} {...drag}>
          <button
            className={styles.twisty}
            aria-label={`${group.collapsed ? 'Expand' : 'Collapse'} ${group.name}`}
            aria-expanded={!group.collapsed}
            onClick={() => useProjectStore.getState().setGroupCollapsed(group.id, !group.collapsed)}
          >
            {group.collapsed ? '▸' : '▾'}
          </button>
          {group.name}
        </div>
      </ActionMenu>
      <div className={`${styles.row} ${styles.groupRow}`} style={{ width }}>
        {members.map((region) => (
          <div
            key={region.id}
            className={styles.memberBar}
            data-testid="arrangement-member-bar"
            style={{ left: region.startBeat * pxPerBeat, width: Math.max(2, arrangementLoopEnd(region, regions) - region.startBeat) * pxPerBeat }}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * The "Arrangement" view: copies of session clips on a timeline, one lane per track. Playback follows
 * the transport; ▶ starts it from the beginning (or resumes from where it was stopped). Session slots
 * drag onto a lane (*Place on arrangement* is the keyboard's way), regions drag across lanes, and a region
 * can loop until the next one on its track.
 */
export const ArrangementView = () => {
  const controls = useEngineControls()
  const rows = useProjectStore((state) => visibleRows(trackRows(state.project)))
  const hiddenTracks = useProjectStore((state) => state.project.tracks.some((track) => track.kind !== 'return' && track.hidden))
  // The clip tracks and their groups; returns have no lane. Each track with the colour of the group it is in.
  const lanes = useMemo(() => {
    const open: { depth: number; colour: GroupColour }[] = []
    return rows.flatMap((row): { row: TrackRow; stripe?: GroupColour }[] => {
      while (open.length && open[open.length - 1]!.depth >= row.depth) open.pop()
      if (row.kind === 'group') {
        open.push({ depth: row.depth, colour: row.group.colour })
        return [{ row }]
      }
      return row.track.kind === 'return' ? [] : [{ row, stripe: open.at(-1)?.colour }]
    })
  }, [rows])
  const placed = useProjectStore((state) => state.project.arrangement)
  const arrangement = placed ?? []
  // The zoom is remembered between sessions, as the piano roll's is.
  const [pxPerBeat, setPxPerBeat] = useStoredState('sfxlab:arrangement-zoom', DEFAULT_PX_PER_BEAT, isZoom)
  // The selection store's: a region deleted from its menu (or by undo) is still named there, and shows as nothing.
  const selected = useSelectionStore((state) => state.regionId)
  /** Where an empty lane was right-clicked, so "add" places the clip there. */
  const [placedAt, setPlacedAt] = useState(0)

  const end = Math.max(0, ...arrangement.map(arrangementEnd))
  const bars = Math.max(MIN_BARS, Math.ceil(end / BEATS_PER_BAR) + TRAILING_BARS)
  const width = bars * BEATS_PER_BAR * pxPerBeat

  // Read when clicked rather than subscribed to, so the timeline doesn't re-render with the transport.
  const start = () => controls.playArrangement(useStatusStore.getState().status?.playing ? undefined : 0)
  const stop = () => controls.stop()

  return (
    <div className={styles.view} data-testid="arrangement-view">
      <div className={styles.toolbar} title={HINT}>
        <strong>Arrangement</strong>
        <button onClick={start} aria-label="Play arrangement">
          ▶ Arrangement
        </button>
        <button onClick={stop} aria-label="Stop">
          ■
        </button>
        <label className={styles.zoom} title="Zoom">
          <input
            type="range"
            min={MIN_PX_PER_BEAT}
            max={MAX_PX_PER_BEAT}
            value={pxPerBeat}
            onChange={(event) => setPxPerBeat(Number(event.target.value))}
          />
        </label>
        <span className={styles.info}>{HINT}</span>
      </div>
      <div className={styles.scroll} data-scroll="both">
        <div className={styles.rulerRow}>
          <div className={styles.rulerCorner} />
          <div className={styles.ruler} style={{ width }}>
            {Array.from({ length: bars }, (_, bar) => (
              <span key={bar} className={styles.barMark} style={{ left: bar * BEATS_PER_BAR * pxPerBeat }}>
                {bar + 1}
              </span>
            ))}
          </div>
        </div>
        {lanes.map(({ row, stripe }) => {
          if (row.kind === 'group') return <GroupLane key={row.group.id} group={row.group} trackIds={row.trackIds} depth={row.depth} regions={arrangement} pxPerBeat={pxPerBeat} width={width} />
          const track = row.track
          return (
            <div key={track.id} className={styles.lane}>
              <LaneName trackId={track.id} name={track.name} depth={row.depth} stripe={stripe} />
              <LaneRow trackId={track.id} pxPerBeat={pxPerBeat} width={width}>
                <ActionMenu subject={{ kind: 'lane', trackId: track.id, beat: placedAt }}>
                  <div
                    className={styles.laneBody}
                    style={{ width }}
                    data-lane={track.id}
                    onContextMenu={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect()
                      setPlacedAt(snap(Math.max(0, (event.clientX - rect.left) / pxPerBeat)))
                    }}
                  />
                </ActionMenu>
                {arrangementOnTrack(arrangement, track.id).map((region) => {
                  const loopEnd = arrangementLoopEnd(region, arrangement)
                  const tailStart = arrangementEnd(region)
                  const tailWidth = Math.max(0, Math.round((loopEnd - tailStart) * pxPerBeat))
                  return (
                    <Fragment key={region.id}>
                      {region.loop && tailWidth > 0 && (
                        <div
                          className={styles.loopTail}
                          data-testid="arrangement-loop-tail"
                          style={{ left: tailStart * pxPerBeat, width: tailWidth }}
                          aria-hidden
                        />
                      )}
                      <ActionMenu subject={{ kind: 'region', regionId: region.id }}>
                        <ArrangementRegion
                          region={region}
                          pxPerBeat={pxPerBeat}
                          selected={selected === region.id}
                          onSelect={() => useSelectionStore.getState().selectRegion(region.id, region.trackId)}
                        />
                      </ActionMenu>
                    </Fragment>
                  )
                })}
                <ArrangementPlayhead pxPerBeat={pxPerBeat} />
              </LaneRow>
            </div>
          )
        })}
        {lanes.length === 0 && (hiddenTracks ? (
          <div className={styles.empty}>
            <p>Every track is hidden. Hidden tracks still play.</p>
            <button onClick={() => useProjectStore.getState().showAllTracks()}>Show all tracks</button>
          </div>
        ) : (
          <div className={styles.empty}>
            <p>No tracks yet. Add a track and give it clips, then place them on the timeline.</p>
            <button onClick={() => useLayoutStore.getState().revealView('session')}>Show {viewTitles.session.toLowerCase()}</button>
          </div>
        ))}
      </div>
    </div>
  )
}
