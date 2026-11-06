import {
  arrangementEnd,
  arrangementLoopEnd,
  arrangementOnTrack,
  arrangementRows,
  type ArrangementClip,
  type ArrangementLoop,
  arrangementContentEnd,
  arrangementStops,
} from '@core'
import { ARRANGEMENT_ZOOM, TIMELINE_GRIDS, type TimelineGrid, gridBeats, playArrangementFromPosition, setArrangementPosition, stopArrangement, toggleArrangementLoop, useArrangementView, useEngineControls, useLayoutStore, useProjectStore, useSelectionStore } from '@state'
import { type CSSProperties, Fragment, type ReactNode, useRef, useState } from 'react'
import { viewTitles } from '../layout/view-titles'
import { useDropTarget } from '../shared/drag'
import { ActionMenu, useFocusSubjects } from '../shared/menu'
import { revealKey, useRevealRequest } from '../shared/reveal'
import { ArrangementHeader } from './ArrangementHeader'
import { ArrangementMarkLines, ArrangementMarks } from './ArrangementMarks'
import { ArrangementPlayhead, ArrangementPosition, PositionMark } from './ArrangementPlayhead'
import { ArrangementRegion } from './ArrangementRegion'
import { RecordingOutline, useRecordingRegions } from './RecordingOutline'
import { ArrangementRuler } from './ArrangementRuler'
import { TimelineLanes } from './TimelineLanes'
import { HeaderSplitter } from './HeaderSplitter'
import { BEATS_PER_BAR, MIN_BARS, TRAILING_BARS } from './timeline-constants'
import { gridSpacing } from './timeline-geometry'
import { useArrangementViewStorage } from './use-arrangement-view-storage'
import { IS_APPLE, keyOf } from '../commands/keys'
import { timelineKeyAction } from './timeline-keys'
import { useFollowPause } from './use-follow'
import { minPxPerBeat, useTimelineZoom, visibleTimeline } from './use-timeline-zoom'
import { useElementWidth } from '../shared/use-element-width'
import styles from './arrangement.module.css'

const NO_REGIONS: readonly ArrangementClip[] = []

/** *Zoom to selection* on a region: it and a bar on each side. */
export const regionZoom = (region: ArrangementClip, regions: readonly ArrangementClip[]) => ({
  from: Math.max(0, region.startBeat - BEATS_PER_BAR),
  to: arrangementLoopEnd(region, regions) + BEATS_PER_BAR,
})

/** *Zoom to selection* with no region selected: the loop brace and a bar on each side. */
export const loopZoom = (loop: ArrangementLoop) => ({ from: Math.max(0, loop.from - BEATS_PER_BAR), to: loop.to + BEATS_PER_BAR })

/** A beat on the grid as it is set now; with Alt held, or the grid off, where it is. */
const onGrid = (beats: number, alt: boolean): number => {
  const step = alt ? null : gridBeats(useArrangementView.getState().grid)
  return Math.max(0, step === null ? beats : Math.round(beats / step) * step)
}

/** How to fill the timeline. Shown in the toolbar while it fits, and always its tooltip. */
const HINT =
  'Drag a session slot onto a lane, or right-click an empty lane to add a session clip; drag regions to move (across lanes too), the edge to resize.'

/** A lane's row: what is dropped on it lands at the snapped beat under the pointer, marked while it is over. */
const LaneRow = ({ trackId, pxPerBeat, width, children }: { trackId: string; pxPerBeat: number; width: number; children: ReactNode }) => {
  const drop = useDropTarget(
    (event) => ({ kind: 'lane', trackId, beat: onGrid((event.clientX - event.currentTarget.getBoundingClientRect().left) / pxPerBeat, event.altKey) }),
    (event, target) => event.currentTarget.style.setProperty('--drop-at', `${(target.kind === 'lane' ? target.beat : 0) * pxPerBeat}px`),
  )
  return (
    <div className={styles.row} style={{ width }} {...drop}>
      {children}
    </div>
  )
}

/** A collapsed group's lane shows where its members' regions are as thin bars; expanded, it is empty. */
const GroupRow = ({ trackIds, collapsed, regions, pxPerBeat, width }: { trackIds: readonly string[]; collapsed: boolean; regions: readonly ArrangementClip[]; pxPerBeat: number; width: number }) => {
  const members = collapsed ? regions.filter((region) => trackIds.includes(region.trackId)) : []
  return (
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
  )
}

/**
 * The "Arrangement" view: copies of session clips on a timeline, one lane per track, with the tracks' and groups'
 * headers at the left. One scroller holds both: the headers are sticky at its left edge and the ruler at its top, so a
 * sideways scroll moves only the timeline and an up-and-down one moves headers and lanes together. Playback follows the
 * transport; ▶ starts it from the beginning. Session slots drag onto a lane (*Place on arrangement* is the keyboard's
 * way), regions drag across lanes, and a region can loop until the next one on its track.
 */
export const ArrangementView = () => {
  useArrangementViewStorage()
  const controls = useEngineControls()
  const rows = useProjectStore((state) => arrangementRows(state.project))
  const hiddenTracks = useProjectStore((state) => state.project.tracks.some((track) => track.kind !== 'return' && track.hidden))
  const arrangement = useProjectStore((state) => state.project.arrangement) ?? NO_REGIONS
  const pxPerBeat = useArrangementView((state) => state.pxPerBeat)
  const grid = useArrangementView((state) => state.grid)
  const headerWidth = useArrangementView((state) => state.headerWidth)
  // The selection store's: a region deleted from its menu (or by undo) is still named there, and shows as nothing.
  const selected = useSelectionStore((state) => state.regionId)
  const recordingRegions = useRecordingRegions()
  const selectedTrack = useSelectionStore((state) => state.trackId)
  const selectedGroup = useSelectionStore((state) => state.groupId)
  const selectedMaster = useSelectionStore((state) => state.master)
  // Returns and the master always have rows; with no clip track shown, the view says why it is empty instead.
  const hasClipRows = rows.some((row) => row.kind === 'track' || row.kind === 'group')
  const view = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  /** Where an empty lane was right-clicked, so "add" places the clip there. */
  const [placedAt, setPlacedAt] = useState(0)

  const end = useProjectStore((state) => arrangementContentEnd(state.project))
  const bars = Math.max(MIN_BARS, Math.ceil(end / BEATS_PER_BAR) + TRAILING_BARS)
  const width = bars * BEATS_PER_BAR * pxPerBeat
  const { barPx, gridPx } = gridSpacing(pxPerBeat, gridBeats(grid))
  const zoomAt = useTimelineZoom(scroller, bars * BEATS_PER_BAR, end > 0 ? end : MIN_BARS * BEATS_PER_BAR)
  // The slider's range: from the whole timeline in the visible width (roughly: the header column taken off) to the closest.
  const scrollerWidth = useElementWidth(scroller)
  const minPx = minPxPerBeat(bars * BEATS_PER_BAR, Math.max(1, scrollerWidth - headerWidth))
  const selectedRegion = useProjectStore((state) => state.project.arrangement?.find((region) => region.id === selected))
  const loop = useProjectStore((state) => state.project.arrangementLoop)
  // *Zoom to selection* shows the selected region, else the brace.
  const selection = selectedRegion ? regionZoom(selectedRegion, arrangement) : loop ? loopZoom(loop) : null

  useFollowPause(scroller)
  // Choosing a row in the Tracks view scrolls its lane (or its collapsed group's) into view.
  useRevealRequest(scroller)
  // The focused timeline is the timeline at the position: the palette lists *Add marker here* and the loop there.
  useFocusSubjects(scroller, () => [{ kind: 'arrangement-timeline', beat: useArrangementView.getState().position }])
  const follow = useArrangementView((state) => state.follow)
  const following = useArrangementView((state) => state.following)

  const style = { '--header-saved': `${headerWidth}px`, '--bar-px': `${barPx}px`, '--grid-px': `${gridPx}px` } as CSSProperties

  return (
    <div className={styles.view} ref={view} style={style} data-testid="arrangement-view">
      <div className={styles.toolbar} title={HINT}>
        <strong>Arrangement</strong>
        <button onClick={() => playArrangementFromPosition(controls)} aria-label="Play arrangement" title="Play the arrangement from the position">
          ▶ Arrangement
        </button>
        <button onClick={() => stopArrangement(controls)} aria-label="Stop" title="Stop; the position stays (press again to go back to the start)">
          ■
        </button>
        <label className={styles.grid} title="What drops, moves and resizes snap to; Alt held during a drag snaps to nothing">
          Grid
          <select value={grid} onChange={(event) => useArrangementView.getState().setGrid(event.target.value as TimelineGrid)}>
            {TIMELINE_GRIDS.map((entry) => (
              <option key={entry.grid} value={entry.grid}>
                {entry.title}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.zoom} title="Zoom (⌘ or Ctrl with the wheel over the lanes)">
          <input
            type="range"
            aria-label="Zoom"
            min={Math.log2(minPx)}
            max={Math.log2(ARRANGEMENT_ZOOM.max)}
            step={0.01}
            value={Math.log2(Math.max(minPx, pxPerBeat))}
            onChange={(event) => zoomAt(2 ** Number(event.target.value))}
          />
        </label>
        <button onClick={() => useArrangementView.getState().zoom('fit')} title="Zoom to fit (Shift+Z)">
          Zoom to fit
        </button>
        <button
          disabled={!selection}
          title={selectedRegion ? 'Zoom to the selected region (Z)' : loop ? 'Zoom to the loop (Z)' : 'Select a region, or draw a loop, to zoom to it'}
          onClick={() => {
            if (selection) useArrangementView.getState().zoom(selection)
          }}
        >
          Zoom to selection
        </button>
        <button
          aria-pressed={follow}
          className={follow && !following ? styles.paused : undefined}
          data-paused={(follow && !following) || undefined}
          title={follow && !following ? 'Follow is paused until the next ▶' : 'Follow the playhead (F)'}
          onClick={() => useArrangementView.getState().setFollow(!follow || !following)}
        >
          Follow
        </button>
        <button
          title="Add a marker at the position (M)"
          onClick={() => {
            useProjectStore.getState().addArrangementMarker(useArrangementView.getState().position)
          }}
        >
          + Marker
        </button>
        <button
          className={styles.loopButton}
          aria-pressed={loop?.enabled === true}
          disabled={!loop}
          title={loop ? 'Loop the brace while the arrangement plays (L)' : 'Drag in the mark lane to draw a loop first'}
          onClick={toggleArrangementLoop}
        >
          ⟳ Loop
        </button>
        <span className={styles.info}>{HINT}</span>
      </div>
      <div
        className={styles.scroll}
        ref={scroller}
        data-scroll="both"
        tabIndex={0}
        aria-label="Timeline"
        onKeyDown={(event) => {
          // The view keys (`timelineKeyAction`), on the timeline itself; a region, a header's buttons and fields keep theirs.
          if (event.target !== event.currentTarget) return
          const key = keyOf(event, IS_APPLE)
          const element = event.currentTarget
          const view = useArrangementView.getState()
          const { width } = visibleTimeline(element)
          const action = key && timelineKeyAction(key, {
            position: view.position,
            gridBeats: gridBeats(view.grid),
            visibleBeats: width / view.pxPerBeat,
            end,
            selection,
            stops: arrangementStops(useProjectStore.getState().project),
            hasLoop: loop !== undefined,
          })
          if (!action) return
          event.preventDefault()
          if (action.position !== undefined) {
            view.setPosition(action.position)
            // Scrolled by the least that shows it.
            const x = action.position * view.pxPerBeat
            if (x < element.scrollLeft) element.scrollLeft = x
            else if (x > element.scrollLeft + width - 1) element.scrollLeft = x - width + 1
          }
          if (action.zoomBy) {
            const x = view.position * view.pxPerBeat - element.scrollLeft
            zoomAt(view.pxPerBeat * action.zoomBy, x >= 0 && x <= width ? x : undefined)
          }
          if (action.zoomTo) view.zoom(action.zoomTo)
          if (action.toggleFollow) view.setFollow(!view.follow || !view.following)
          if (action.addMarker) useProjectStore.getState().addArrangementMarker(view.position)
          if (action.toggleLoop) toggleArrangementLoop()
        }}
        onPointerDown={(event) => {
          // A press on the lanes or the ruler (not a region, a header or a button) gives the timeline the keys.
          const target = event.target as Element
          if (target.closest('[data-lane], [data-marks], [data-testid="arrangement-ruler"]')) event.currentTarget.focus({ preventScroll: true })
        }}
      >
        <div className={styles.timeline}>
          <div className={styles.rulerRow}>
            <div className={styles.corner} data-corner>
              <HeaderSplitter view={view} />
            </div>
            <div
              className={styles.ruler}
              style={{ width }}
              title="Click to set where the arrangement plays from (Alt: off the grid)"
              onPointerDown={(event) => {
                if (event.button !== 0) return
                setArrangementPosition(controls, onGrid((event.clientX - event.currentTarget.getBoundingClientRect().left) / pxPerBeat, event.altKey))
              }}
            >
              <PositionMark pxPerBeat={pxPerBeat} />
              <ArrangementRuler scroller={scroller} pxPerBeat={pxPerBeat} headerWidth={headerWidth} />
            </div>
          </div>
          <div className={styles.marksRow}>
            <div className={styles.marksCorner} title="Markers and the loop brace">
              Markers
            </div>
            <ArrangementMarks scroller={scroller} pxPerBeat={pxPerBeat} width={width} />
          </div>
          {/* Before the lanes, so the regions are drawn over the lines. */}
          <div className={styles.markLines} style={{ width }} aria-hidden>
            <ArrangementMarkLines pxPerBeat={pxPerBeat} />
          </div>
          {hasClipRows && rows.map((row) => {
            if (row.kind === 'master' || row.kind === 'return') {
              // A return's and the master's rows hold no regions: nothing is dropped on them.
              const key = row.kind === 'master' ? 'master' : row.track.id
              const isSelected = row.kind === 'master' ? selectedMaster : row.track.id === selectedTrack
              return (
                <Fragment key={key}>
                  <div className={styles.lane} data-reveal={row.kind === 'master' ? 'master' : revealKey('track', row.track.id)} data-selected={isSelected || undefined} data-owner-row={key}>
                    <ArrangementHeader row={row} />
                    <div className={`${styles.row} ${styles.ownerRow}`} style={{ width }} />
                  </div>
                  <TimelineLanes
                    owner={row.kind === 'master' ? { kind: 'master' } : { kind: 'track', trackId: row.track.id }}
                    name={row.kind === 'master' ? 'Master' : row.track.name}
                    scroller={scroller}
                    pxPerBeat={pxPerBeat}
                    width={width}
                    depth={0}
                  />
                </Fragment>
              )
            }
            if (row.kind === 'group') {
              return (
                <Fragment key={row.group.id}>
                <div
                  className={`${styles.lane} ${styles.groupLane}`}
                  data-reveal={revealKey('group', row.group.id)}
                  // A collapsed group's lane stands for the selected track inside it.
                  data-selected={row.group.id === selectedGroup || (row.group.collapsed === true && selectedTrack !== null && row.trackIds.includes(selectedTrack)) || undefined}
                  style={{ '--group': `var(--group-${row.group.colour})` } as CSSProperties}>
                  <ArrangementHeader row={row} />
                  <GroupRow trackIds={row.trackIds} collapsed={row.group.collapsed === true} regions={arrangement} pxPerBeat={pxPerBeat} width={width} />
                </div>
                {row.group.bus && <TimelineLanes owner={{ kind: 'group', groupId: row.group.id }} name={row.group.name} scroller={scroller} pxPerBeat={pxPerBeat} width={width} depth={row.depth} />}
                </Fragment>
              )
            }
            const track = row.track
            return (
              <Fragment key={track.id}>
              <div className={styles.lane} data-reveal={revealKey('track', track.id)} data-selected={track.id === selectedTrack || undefined}>
                <ArrangementHeader row={row} />
                <LaneRow trackId={track.id} pxPerBeat={pxPerBeat} width={width}>
                  <ActionMenu subject={{ kind: 'lane', trackId: track.id, beat: placedAt }}>
                    <div
                      className={styles.laneBody}
                      style={{ width }}
                      data-lane={track.id}
                      onContextMenu={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect()
                        setPlacedAt(onGrid((event.clientX - rect.left) / pxPerBeat, event.altKey))
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
                            recording={recordingRegions.has(region.id)}
                            onSelect={() => useSelectionStore.getState().selectRegion(region.id, region.trackId)}
                          />
                        </ActionMenu>
                      </Fragment>
                    )
                  })}
                  <RecordingOutline trackId={track.id} pxPerBeat={pxPerBeat} />
                </LaneRow>
              </div>
              <TimelineLanes owner={{ kind: 'track', trackId: track.id }} name={track.name} scroller={scroller} pxPerBeat={pxPerBeat} width={width} depth={row.depth} />
              </Fragment>
            )
          })}
          {hasClipRows && (
            <div className={styles.overlay} style={{ width }} aria-hidden>
              <ArrangementPosition pxPerBeat={pxPerBeat} />
              <ArrangementPlayhead pxPerBeat={pxPerBeat} scroller={scroller} />
            </div>
          )}
        </div>
        {!hasClipRows && (hiddenTracks ? (
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
