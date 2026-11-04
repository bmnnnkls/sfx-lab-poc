import {
  arrangementEnd,
  arrangementLoopEnd,
  arrangementOnTrack,
  arrangementRows,
  type ArrangementClip,
  timelineEnd,
} from '@core'
import { ARRANGEMENT_ZOOM, gridBeats, useArrangementView, useEngineControls, useLayoutStore, useProjectStore, useSelectionStore, useStatusStore } from '@state'
import { type CSSProperties, Fragment, type ReactNode, useRef, useState } from 'react'
import { viewTitles } from '../layout/view-titles'
import { useDropTarget } from '../shared/drag'
import { ActionMenu } from '../shared/menu'
import { ArrangementHeader } from './ArrangementHeader'
import { ArrangementPlayhead } from './ArrangementPlayhead'
import { ArrangementRegion } from './ArrangementRegion'
import { ArrangementRuler } from './ArrangementRuler'
import { HeaderSplitter } from './HeaderSplitter'
import { BEATS_PER_BAR, MIN_BARS, TRAILING_BARS } from './timeline-constants'
import { gridSpacing } from './timeline-geometry'
import { useArrangementViewStorage } from './use-arrangement-view-storage'
import { minPxPerBeat, useTimelineZoom } from './use-timeline-zoom'
import { useElementWidth } from '../shared/use-element-width'
import styles from './arrangement.module.css'

const NO_REGIONS: readonly ArrangementClip[] = []

/** *Zoom to selection* on a region: it and a bar on each side. */
export const regionZoom = (region: ArrangementClip, regions: readonly ArrangementClip[]) => ({
  from: Math.max(0, region.startBeat - BEATS_PER_BAR),
  to: arrangementLoopEnd(region, regions) + BEATS_PER_BAR,
})

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
  const view = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  /** Where an empty lane was right-clicked, so "add" places the clip there. */
  const [placedAt, setPlacedAt] = useState(0)

  const end = timelineEnd(arrangement)
  const bars = Math.max(MIN_BARS, Math.ceil(end / BEATS_PER_BAR) + TRAILING_BARS)
  const width = bars * BEATS_PER_BAR * pxPerBeat
  const { barPx, gridPx } = gridSpacing(pxPerBeat, gridBeats(grid))
  const zoomAt = useTimelineZoom(scroller, bars * BEATS_PER_BAR, end > 0 ? end : MIN_BARS * BEATS_PER_BAR)
  // The slider's range: from the whole timeline in the visible width (roughly: the header column taken off) to the closest.
  const scrollerWidth = useElementWidth(scroller)
  const minPx = minPxPerBeat(bars * BEATS_PER_BAR, Math.max(1, scrollerWidth - headerWidth))
  const selectedRegion = useProjectStore((state) => state.project.arrangement?.find((region) => region.id === selected))

  // Read when clicked rather than subscribed to, so the timeline doesn't re-render with the transport.
  const start = () => controls.playArrangement(useStatusStore.getState().status?.playing ? undefined : 0)
  const stop = () => controls.stop()

  const style = { '--header-saved': `${headerWidth}px`, '--bar-px': `${barPx}px`, '--grid-px': `${gridPx}px` } as CSSProperties

  return (
    <div className={styles.view} ref={view} style={style} data-testid="arrangement-view">
      <div className={styles.toolbar} title={HINT}>
        <strong>Arrangement</strong>
        <button onClick={start} aria-label="Play arrangement">
          ▶ Arrangement
        </button>
        <button onClick={stop} aria-label="Stop">
          ■
        </button>
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
          disabled={!selectedRegion}
          title={selectedRegion ? 'Zoom to the selected region (Z)' : 'Select a region to zoom to it'}
          onClick={() => {
            if (selectedRegion) useArrangementView.getState().zoom(regionZoom(selectedRegion, arrangement))
          }}
        >
          Zoom to selection
        </button>
        <span className={styles.info}>{HINT}</span>
      </div>
      <div className={styles.scroll} ref={scroller} data-scroll="both">
        <div className={styles.timeline}>
          <div className={styles.rulerRow}>
            <div className={styles.corner} data-corner>
              <HeaderSplitter view={view} />
            </div>
            <div className={styles.ruler} style={{ width }}>
              <ArrangementRuler scroller={scroller} pxPerBeat={pxPerBeat} headerWidth={headerWidth} />
            </div>
          </div>
          {rows.map((row) => {
            if (row.kind === 'group') {
              return (
                <div key={row.group.id} className={`${styles.lane} ${styles.groupLane}`} style={{ '--group': `var(--group-${row.group.colour})` } as CSSProperties}>
                  <ArrangementHeader row={row} />
                  <GroupRow trackIds={row.trackIds} collapsed={row.group.collapsed === true} regions={arrangement} pxPerBeat={pxPerBeat} width={width} />
                </div>
              )
            }
            const track = row.track
            return (
              <div key={track.id} className={styles.lane}>
                <ArrangementHeader row={row} />
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
                </LaneRow>
              </div>
            )
          })}
          {rows.length > 0 && (
            <div className={styles.overlay} style={{ width }} aria-hidden>
              <ArrangementPlayhead pxPerBeat={pxPerBeat} />
            </div>
          )}
        </div>
        {rows.length === 0 && (hiddenTracks ? (
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
