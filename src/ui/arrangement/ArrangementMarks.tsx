import { type ArrangementMarker, MIN_LOOP_BEATS } from '@core'
import { type Subject, commitRename, gridBeats, markerTitle, setArrangementPosition, startRename, useArrangementView, useEngineControls, useProjectStore, useRenameStore } from '@state'
import { type RefObject, useRef, useState } from 'react'
import { ActionMenu, useActionContext } from '../shared/menu'
import { RenameField } from '../shared/RenameField'
import { autoScrollUnits } from '../shared/timeline'
import { snapBeat, snapRegionStart, timelineSnapping } from './region-snap'
import { BEATS_PER_BAR } from './timeline-constants'
import { visibleTimeline } from './use-timeline-zoom'
import styles from './arrangement.module.css'

const NO_MARKERS: readonly ArrangementMarker[] = []

/** What a press in the mark lane drags: a new brace, a marker, the brace whole, or one of its edges. */
type Grip = { readonly kind: 'draw' } | { readonly kind: 'marker'; readonly id: string; readonly beat: number } | { readonly kind: 'brace' | 'from' | 'to'; readonly from: number; readonly to: number }

interface MarkDrag {
  readonly grip: Grip
  readonly startX: number
  /** The beat under the press, as it is (unsnapped). */
  readonly startBeat: number
  /** The pointer, for the auto-scroll's frames. */
  last: { x: number; y: number }
  /** Alt is held: nothing snaps. */
  alt: boolean
  /** Past a few pixels from the press: a drag, not a click. */
  moved: boolean
  /** The auto-scroll's animation frame while it runs. */
  frame: number
  /** What the gesture's edits merge under, one undo step each: a draw and then a resize are two, however quick. */
  readonly key: string
}

/** Counts gestures, so each has its own undo step. */
let gestures = 0

/** How far the pointer moves before a press is a drag, in pixels. */
const DRAG_PX = 3
/** How close to the timeline's side the pointer starts the auto-scroll, in pixels. */
const AUTO_SCROLL_EDGE = 24

/** A beat on the timeline as its bar and beat, counted from 1: beat 16 is *5.1*. */
const barBeat = (beat: number) => `${Math.floor(beat / BEATS_PER_BAR) + 1}.${Math.floor(beat % BEATS_PER_BAR) + 1}`

/**
 * The mark lane under the ruler: the arrangement's markers, each a flag and its name, and the loop brace, dimmed while
 * looping is off. All are elements, so each presses, takes the focus (its verbs and the palette act on it) and has a
 * menu. A press and a drag moves a marker or the brace (its edges resize it), snapped as regions are; a drag in the
 * empty lane draws a new brace; a click without a drag puts the position there. Alt snaps to nothing, and a drag near
 * the timeline's side scrolls it. A double-click on a marker renames it in place.
 */
export const ArrangementMarks = ({ scroller, pxPerBeat, width }: { scroller: RefObject<HTMLDivElement | null>; pxPerBeat: number; width: number }) => {
  const markers = useProjectStore((state) => state.project.arrangementMarkers) ?? NO_MARKERS
  const loop = useProjectStore((state) => state.project.arrangementLoop)
  const controls = useEngineControls()
  const context = useActionContext()
  const renaming = useRenameStore((state) => {
    const subject = state.renaming?.origin === context.origin ? state.renaming.subject : null
    return subject?.kind === 'arrangement-marker' ? subject.markerId : null
  })
  const lane = useRef<HTMLDivElement>(null)
  const drag = useRef<MarkDrag | null>(null)
  /** Where the empty lane was right-clicked, so *Add marker here* adds it there. */
  const [menuBeat, setMenuBeat] = useState(0)

  const beatAt = (x: number) => (x - (lane.current?.getBoundingClientRect().left ?? 0)) / pxPerBeat

  /** The drag at the pointer `x`: what it moves, snapped to the grid and the timeline's edges and marks (`timelineSnapping`). */
  const move = (state: MarkDrag, x: number) => {
    if (!state.moved && Math.abs(x - state.startX) < DRAG_PX) return
    state.moved = true
    const { grip } = state
    const store = useProjectStore.getState()
    const moving = grip.kind === 'marker' ? `marker:${grip.id}` : 'loop'
    const snapping = state.alt ? null : timelineSnapping(store.project, moving)
    const grid = state.alt ? null : gridBeats(useArrangementView.getState().grid)
    const axis = { start: 0, perPixel: 1 / pxPerBeat, width: 1 }
    const snap = (beat: number) => snapBeat(beat, grid, snapping, axis)
    const delta = beatAt(x) - state.startBeat
    switch (grip.kind) {
      case 'draw':
        return store.setArrangementLoop({ from: snap(state.startBeat), to: snap(state.startBeat + delta) }, state.key)
      case 'marker':
        return store.moveArrangementMarker(grip.id, snap(grip.beat + delta), state.key)
      case 'brace': {
        const from = snapRegionStart(grip.from + delta, grip.to - grip.from, snap)
        return store.setArrangementLoop({ from, to: from + grip.to - grip.from }, state.key)
      }
      case 'from':
        return store.setArrangementLoop({ from: Math.min(snap(grip.from + delta), grip.to - MIN_LOOP_BEATS), to: grip.to }, state.key)
      case 'to':
        return store.setArrangementLoop({ from: grip.from, to: Math.max(snap(grip.to + delta), grip.from + MIN_LOOP_BEATS) }, state.key)
    }
  }
  // The auto-scroll's frames run after re-renders, so they call the latest `move`.
  const moveRef = useRef(move)
  moveRef.current = move

  /** While the pointer is near or past the timeline's side, scrolls it a little each frame and moves the drag along. */
  const autoScroll = (state: MarkDrag) => {
    const element = scroller.current
    if (!element || state.frame || !state.moved) return
    const tick = () => {
      state.frame = 0
      if (drag.current !== state) return
      const { left, width: visible } = visibleTimeline(element)
      const box = element.getBoundingClientRect()
      const start = box.left + left + AUTO_SCROLL_EDGE
      const end = box.left + element.clientWidth - AUTO_SCROLL_EDGE
      const distance = state.last.x < start ? state.last.x - start : state.last.x > end ? state.last.x - end : 0
      if (distance === 0) return
      const before = element.scrollLeft
      element.scrollLeft += autoScrollUnits(distance, 1, visible)
      if (element.scrollLeft === before) return
      moveRef.current(state, state.last.x)
      state.frame = requestAnimationFrame(tick)
    }
    state.frame = requestAnimationFrame(tick)
  }

  const press = (grip: Grip) => (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    event.stopPropagation()
    // A press in the empty lane gives the timeline the keys, as a press on the lanes does.
    if (grip.kind === 'draw') scroller.current?.focus({ preventScroll: true })
    const key = `${grip.kind === 'marker' ? `arr-marker:${grip.id}` : 'arr-loop'}:${++gestures}`
    drag.current = { grip, startX: event.clientX, startBeat: beatAt(event.clientX), last: { x: event.clientX, y: event.clientY }, alt: event.altKey, moved: false, frame: 0, key }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onMove = (event: React.PointerEvent) => {
    const state = drag.current
    if (!state) return
    // A brace's edge is inside the brace: one move each.
    event.stopPropagation()
    state.last = { x: event.clientX, y: event.clientY }
    state.alt = event.altKey
    move(state, event.clientX)
    autoScroll(state)
  }

  const release = (event: React.PointerEvent<HTMLElement>) => {
    const state = drag.current
    if (!state) return
    event.stopPropagation()
    drag.current = null
    if (state.frame) cancelAnimationFrame(state.frame)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (state.moved || event.type === 'pointercancel') return
    // A click: the position goes to the marker, or, in the empty lane, to the grid line under the pointer.
    if (state.grip.kind === 'marker') setArrangementPosition(controls, state.grip.beat)
    else if (state.grip.kind === 'draw') {
      const step = state.alt ? null : gridBeats(useArrangementView.getState().grid)
      setArrangementPosition(controls, Math.max(0, step === null ? state.startBeat : Math.round(state.startBeat / step) * step))
    }
  }

  const handlers = (grip: Grip) => ({ onPointerDown: press(grip), onPointerMove: onMove, onPointerUp: release, onPointerCancel: release })

  const renamed = renaming === null ? undefined : markers.find((marker) => marker.id === renaming)

  return (
    <div className={styles.marks} ref={lane} style={{ width }} data-testid="arrangement-marks">
      <ActionMenu subject={{ kind: 'arrangement-timeline', beat: menuBeat }}>
        <div
          className={styles.marksBody}
          data-marks
          title="Drag to draw the loop; click to set the position"
          onContextMenu={(event) => setMenuBeat(Math.max(0, beatAt(event.clientX)))}
          {...handlers({ kind: 'draw' })}
        />
      </ActionMenu>
      {loop && (
        <ActionMenu subject={{ kind: 'arrangement-loop' }}>
          <div
            className={styles.brace}
            data-testid="arrangement-loop-brace"
            data-enabled={loop.enabled === true || undefined}
            role="group"
            tabIndex={0}
            aria-label={`Loop ${barBeat(loop.from)} – ${barBeat(loop.to)}${loop.enabled ? '' : ', off'}`}
            style={{ left: loop.from * pxPerBeat, width: Math.max(1, (loop.to - loop.from) * pxPerBeat) }}
            {...handlers({ kind: 'brace', from: loop.from, to: loop.to })}
          >
            <div className={`${styles.braceEdge} ${styles.braceFrom}`} data-testid="arrangement-loop-from" {...handlers({ kind: 'from', from: loop.from, to: loop.to })} />
            <div className={`${styles.braceEdge} ${styles.braceTo}`} data-testid="arrangement-loop-to" {...handlers({ kind: 'to', from: loop.from, to: loop.to })} />
          </div>
        </ActionMenu>
      )}
      {markers.map((marker, index) => {
        const next = markers[index + 1]
        const subject: Subject = { kind: 'arrangement-marker', markerId: marker.id }
        return (
          <ActionMenu key={marker.id} subject={subject}>
            <button
              className={styles.marker}
              data-testid="arrangement-marker"
              data-beat={marker.beat}
              aria-label={markerTitle(marker.name)}
              title={`${marker.name} at ${barBeat(marker.beat)}: click to go there, drag to move, double-click to rename`}
              // The name is cut at the next marker.
              style={{ left: marker.beat * pxPerBeat, maxWidth: next ? Math.max(12, (next.beat - marker.beat) * pxPerBeat) : undefined }}
              onDoubleClick={() => startRename(subject, context)}
              {...handlers({ kind: 'marker', id: marker.id, beat: marker.beat })}
            >
              <span className={styles.markerName}>{marker.name}</span>
            </button>
          </ActionMenu>
        )
      })}
      {renamed && (
        // The lane's own press would take the focus from the field.
        <span className={styles.markerRename} style={{ left: renamed.beat * pxPerBeat }} onPointerDown={(event) => event.stopPropagation()}>
          <RenameField
            name={renamed.name}
            label={`Name of marker ${renamed.name}`}
            select
            onCommit={(typed) => void commitRename({ kind: 'arrangement-marker', markerId: renamed.id }, typed, context)}
            onDone={() => useRenameStore.getState().stop()}
          />
        </span>
      )}
    </div>
  )
}

/** Faint lines down the lanes under the markers and the brace's edges, drawn under the regions. */
export const ArrangementMarkLines = ({ pxPerBeat }: { pxPerBeat: number }) => {
  const markers = useProjectStore((state) => state.project.arrangementMarkers) ?? NO_MARKERS
  const loop = useProjectStore((state) => state.project.arrangementLoop)
  return (
    <>
      {markers.map((marker) => (
        <div key={marker.id} className={styles.markLine} style={{ left: marker.beat * pxPerBeat }} />
      ))}
      {loop && (
        <>
          <div className={`${styles.markLine} ${styles.loopLine}`} data-enabled={loop.enabled === true || undefined} style={{ left: loop.from * pxPerBeat }} />
          <div className={`${styles.markLine} ${styles.loopLine}`} data-enabled={loop.enabled === true || undefined} style={{ left: loop.to * pxPerBeat }} />
        </>
      )}
    </>
  )
}
