import {
  type ArrangementClip,
  MIN_CLIP_BEATS,
  clipFitsTrack,
  isAudioContent,
} from '@core'
import { gridBeats, openRegion, useArrangementView, useProjectStore } from '@state'
import { useRef } from 'react'
import { autoScrollUnits } from '../shared/timeline'
import { WaveformThumb } from '../shared/WaveformThumb'
import { snapBeat, snapRegionStart, timelineSnapping } from './region-snap'
import { visibleTimeline } from './use-timeline-zoom'
import styles from './arrangement.module.css'

const MIN_PITCH = 21
const MAX_PITCH = 108

/**
 * The region is the child of a Radix context menu (`asChild`), so it forwards everything it does not
 * use itself — the trigger's handlers, `data-state` and `ref` — onto its root element.
 */
interface RegionProps extends React.ComponentPropsWithRef<'div'> {
  region: ArrangementClip
  pxPerBeat: number
  selected: boolean
  onSelect(): void
}

interface DragState {
  readonly startX: number
  origin: number
  readonly resizing: boolean
  /** The timeline's scroller and its scroll when the drag began, so a drag that scrolls the view keeps its beat. */
  readonly scroller: HTMLElement | null
  readonly startLeft: number
  /** The pointer, for the auto-scroll's frames. */
  last: { x: number; y: number }
  /** Alt is held: nothing snaps. */
  alt: boolean
  /** The auto-scroll's animation frame while it runs. */
  frame: number
  /** The lane the pointer is over, or null while it has not left the region's own lane or the lane can't take it. */
  targetLane: string | null
  /** The lane element currently highlighted, so the hint moves with the pointer. */
  hover: Element | null
}

/** How close to the timeline's side the pointer starts the auto-scroll, in pixels. */
const AUTO_SCROLL_EDGE = 24

/**
 * One clip on the timeline: drag the body to move it in time (and onto another lane to move it across
 * tracks), drag the right edge to resize. A drag near or past the timeline's side scrolls it. A drag merges into
 * one undo step. Pressing it selects it; double-click or Enter opens its own copy in Clip. A looping region shows
 * a repeat badge; the view draws the span it repeats over (up to the next region) beside it.
 */
export const ArrangementRegion = ({ region, pxPerBeat, selected, onSelect, ...domProps }: RegionProps) => {
  const update = useProjectStore((state) => state.updateArrangementClip)
  const drag = useRef<DragState | null>(null)

  const startDrag = (event: React.PointerEvent, resizing: boolean) => {
    if (event.button !== 0) return
    event.stopPropagation()
    onSelect()
    const scroller = event.currentTarget.closest<HTMLElement>('[data-scroll]')
    drag.current = {
      startX: event.clientX,
      origin: resizing ? region.content.lengthBeats : region.startBeat,
      resizing,
      scroller,
      startLeft: scroller?.scrollLeft ?? 0,
      last: { x: event.clientX, y: event.clientY },
      alt: event.altKey,
      frame: 0,
      targetLane: null,
      hover: null,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  /** The lane element the pointer is over, or null when it is not on a lane (the ruler, outside). */
  const laneAt = (x: number, y: number): HTMLElement | null => {
    const lane = document.elementFromPoint(x, y)?.closest('[data-lane]')
    return lane instanceof HTMLElement ? lane : null
  }

  /**
   * The drag at the pointer `x`, `y`: the region's new start or length, and the lane it is over. Its edges snap to the
   * grid and to other regions' edges; with Alt held, to nothing.
   */
  const move = (state: DragState, x: number, y: number) => {
    const deltaBeats = (x - state.startX + (state.scroller?.scrollLeft ?? 0) - state.startLeft) / pxPerBeat
    const axis = { start: 0, perPixel: 1 / pxPerBeat, width: 1 }
    const snapping = state.alt ? null : timelineSnapping(useProjectStore.getState().project, region.id)
    const grid = state.alt ? null : gridBeats(useArrangementView.getState().grid)
    const snap = (beat: number) => snapBeat(beat, grid, snapping, axis)
    if (state.resizing) {
      const lengthBeats = Math.max(MIN_CLIP_BEATS, snap(region.startBeat + state.origin + deltaBeats) - region.startBeat)
      update(region.id, { content: { ...region.content, lengthBeats } }, `arr-size:${region.id}`)
      return
    }
    const startBeat = snapRegionStart(state.origin + deltaBeats, region.content.lengthBeats, snap)
    update(region.id, { startBeat }, `arr-move:${region.id}`)
    // Vertical dragging onto another lane highlights the target; the move itself happens on the drop.
    // A lane of the other kind of track (a MIDI region over an audio track) shows refuse and doesn't take it.
    const lane = laneAt(x, y)
    if (lane !== state.hover) {
      state.hover?.removeAttribute('data-drag-over')
      const trackId = lane?.dataset.lane ?? null
      const fits = trackId !== null && clipFitsTrack(region.content, useProjectStore.getState().project.tracks.find((track) => track.id === trackId))
      state.targetLane = fits ? trackId : null
      state.hover = lane
      lane?.setAttribute('data-drag-over', fits ? 'accept' : 'refuse')
    }
  }
  // The auto-scroll's frames run after re-renders, so they call the latest `move`.
  const moveRef = useRef(move)
  moveRef.current = move

  /** While the pointer is near or past the timeline's side, scrolls it a little each frame and moves the drag along. */
  const autoScroll = (state: DragState) => {
    const scroller = state.scroller
    if (!scroller || state.frame) return
    const tick = () => {
      state.frame = 0
      if (drag.current !== state) return
      const { left, width } = visibleTimeline(scroller)
      const box = scroller.getBoundingClientRect()
      const start = box.left + left + AUTO_SCROLL_EDGE
      const end = box.left + scroller.clientWidth - AUTO_SCROLL_EDGE
      const distance = state.last.x < start ? state.last.x - start : state.last.x > end ? state.last.x - end : 0
      if (distance === 0) return
      const before = scroller.scrollLeft
      scroller.scrollLeft += autoScrollUnits(distance, 1, width)
      if (scroller.scrollLeft === before) return
      moveRef.current(state, state.last.x, state.last.y)
      state.frame = requestAnimationFrame(tick)
    }
    state.frame = requestAnimationFrame(tick)
  }

  const onMove = (event: React.PointerEvent) => {
    const state = drag.current
    if (!state) return
    state.last = { x: event.clientX, y: event.clientY }
    state.alt = event.altKey
    move(state, event.clientX, event.clientY)
    autoScroll(state)
  }

  const endDrag = (event: React.PointerEvent) => {
    const state = drag.current
    if (!state) return
    drag.current = null
    if (state.frame) cancelAnimationFrame(state.frame)
    state.hover?.removeAttribute('data-drag-over')
    if (!state.resizing && state.targetLane !== null && state.targetLane !== region.trackId) {
      update(region.id, { trackId: state.targetLane }, `arr-move:${region.id}`)
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const audio = isAudioContent(region.content)
  const width = Math.max(8, Math.round(region.content.lengthBeats * pxPerBeat))
  const looping = region.loop === true

  return (
    <div
      {...domProps}
      className={`${styles.region} ${selected ? styles.selected : ''}`}
      style={{ left: region.startBeat * pxPerBeat, width }}
      data-testid="arrangement-region"
      data-looping={looping ? 'true' : undefined}
      tabIndex={0}
      onDoubleClick={() => openRegion(region.id)}
      onKeyDown={(event) => {
        // The menu's Shift+F10 first.
        domProps.onKeyDown?.(event)
        if (!event.defaultPrevented && event.key === 'Enter') openRegion(region.id)
      }}
      onPointerDown={(event) => startDrag(event, false)}
      onPointerMove={onMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <span className={styles.regionName}>{region.content.name}</span>
      {looping && (
        <span className={styles.loopBadge} title="Loops until the next region on this track">
          ⟳
        </span>
      )}
      {audio ? (
        <div className={styles.waveform}>
          <WaveformThumb sampleId={region.content.sampleId} width={width} height={22} />
        </div>
      ) : (
        <div className={styles.notes}>
          {region.content.notes.slice(0, 200).map((note) => (
            <span
              key={note.id}
              className={styles.noteRect}
              style={{
                left: note.start * pxPerBeat,
                width: Math.max(2, note.duration * pxPerBeat),
                top: `${(1 - (note.pitch - MIN_PITCH) / (MAX_PITCH - MIN_PITCH)) * 100}%`,
              }}
            />
          ))}
        </div>
      )}
      <div
        className={styles.handle}
        data-testid="arrangement-region-handle"
        onPointerDown={(event) => startDrag(event, true)}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
    </div>
  )
}
