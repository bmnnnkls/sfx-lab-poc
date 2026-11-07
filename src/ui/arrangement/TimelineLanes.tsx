import {
  type AutomationLane,
  type AutomationPoint,
  type ControlOwner,
  type ControlTarget,
  MAX_TIMELINE_BEATS,
  automationOwnerKey,
  controlTargetKey,
  controlTargetLabel,
  enumerateControlTargets,
  resolveControlTarget,
  timelineLanesOf,
  timelineLanesOpen,
} from '@core'
import {
  automationGestureKey,
  createClipboard,
  editTimelineAutomation,
  gridBeats,
  readLane,
  useArrangementView,
  useClipboard,
  useControlStore,
  useProjectStore,
  useTimelineLaneRequest,
  useTouchStore,
} from '@state'
import { type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject, useEffect, useRef, useState } from 'react'
import { CcLaneField } from '../automation/CcLaneField'
import { type PointGesture, type PointGrid, type PointerAt, copyPoints, dragPoints, pastePoints, pressPoints, removePoints } from '../automation/point-gestures'
import { Icon } from '../shared/icon'
import { ActionMenu } from '../shared/menu'
import { useThemeColors } from '../theme/theme-colors'
import { snapBeat, timelineSnapping } from './region-snap'
import { timelineAxis } from './timeline-geometry'
import { LANE_HEIGHT, beatAtX, curvePolyline, pointAt, valueAtY, xOfBeat, yOfValue } from './timeline-lane-geometry'
import styles from './arrangement.module.css'

/** Points copied from a timeline lane, beats from the first; pasted at the position. */
const pointClipboard = createClipboard<readonly AutomationPoint[]>([])
const newPointId = () => crypto.randomUUID()
const COLORS = ['--accent', '--text'] as const

interface LaneProps {
  readonly owner: ControlOwner
  readonly scroller: RefObject<HTMLDivElement | null>
  readonly pxPerBeat: number
  readonly width: number
  readonly depth: number
}

/** The owner's lanes as they are now (not as the last render saw them): a drag edits from these. */
const currentLanes = (owner: ControlOwner) => timelineLanesOf(useProjectStore.getState().project, owner)

/** Replaces one lane's points: one undo step, a drag's edits merging under its key. */
const editPoints = (owner: ControlOwner, laneId: string, points: readonly AutomationPoint[], key?: string) =>
  editTimelineAutomation(owner, currentLanes(owner).map((lane) => (lane.id === laneId ? { ...lane, points } : lane)), key)

/**
 * An owner's automation lanes on the timeline, under its row while its lanes twisty is open: one lane per target, then
 * a row to add one. Nothing while the twisty is closed.
 */
export const TimelineLanes = ({ owner, name, ...props }: LaneProps & { readonly name: string }) => {
  const open = useProjectStore((state) => timelineLanesOpen(state.project, owner))
  const lanes = useProjectStore((state) => timelineLanesOf(state.project, owner))
  if (!open) return null
  return (
    <>
      {lanes.map((lane) => <TimelineLane key={lane.id} owner={owner} lane={lane} {...props} />)}
      <AddLaneRow owner={owner} name={name} lanes={lanes} width={props.width} depth={props.depth} />
    </>
  )
}

/** One lane: its header (name, on/off, ● while touch records it, *Read* while overridden) and its body, a canvas of the visible timeline. */
const TimelineLane = ({ owner, lane, scroller, pxPerBeat, width, depth }: LaneProps & { readonly lane: AutomationLane }) => {
  const project = useProjectStore((state) => state.project)
  const colors = useThemeColors(COLORS)
  const key = controlTargetKey(lane.target)
  const overridden = useControlStore((state) => state.overrides.some((entry) => controlTargetKey(entry.target) === key))
  const recording = useTouchStore((state) => state.recording.includes(key))
  const label = controlTargetLabel(project, lane.target)
  const resolved = resolveControlTarget(project, lane.target)
  const reason = resolved.status !== 'available' ? resolved.reason : resolved.automatable ? undefined : resolved.reason
  const stepped = resolved.status === 'available' && resolved.interpolation === 'hold'
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [box, setBox] = useState<{ from: PointerAt; to: PointerAt } | null>(null)
  const [menuBeat, setMenuBeat] = useState<number | undefined>(undefined)
  const canvas = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ key: string; gesture: PointGesture } | null>(null)
  const copied = useClipboard(pointClipboard)
  // *Show automation on timeline* asks this lane to show itself: it scrolls into view and takes the focus.
  const requested = useTimelineLaneRequest((state) => state.key === key)
  useEffect(() => {
    if (!requested) return
    // The Arrangement may be revealed in the same update: try for a few frames, until the lane can take the focus.
    let frame = 0, tries = 0
    const attempt = () => {
      const element = canvas.current
      if (element) {
        element.scrollIntoView({ block: 'nearest' })
        element.focus({ preventScroll: true })
        if (document.activeElement === element || ++tries >= 10) { useTimelineLaneRequest.getState().clear(); return }
      }
      frame = requestAnimationFrame(attempt)
    }
    attempt()
    return () => cancelAnimationFrame(frame)
  }, [requested])

  // Redrawn in an animation frame on scroll, resize and edits, as the ruler is.
  useEffect(() => {
    const element = canvas.current
    const scroll = scroller.current
    if (!element || !scroll) return
    let request = 0
    const draw = () => {
      request = 0
      const context = element.getContext('2d')
      if (!context) return
      const ratio = window.devicePixelRatio || 1
      const visible = Math.max(1, scroll.clientWidth - (element.parentElement?.offsetLeft ?? 0))
      element.style.width = `${visible}px`
      element.width = Math.round(visible * ratio)
      element.height = Math.round(LANE_HEIGHT * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      const accent = colors['--accent']
      const text = colors['--text']
      const axis = timelineAxis(scroll.scrollLeft, visible, pxPerBeat)
      const line = curvePolyline(lane.points, axis, stepped)
      context.globalAlpha = lane.enabled && !reason ? 1 : 0.4
      context.strokeStyle = accent
      context.lineWidth = 1.5
      context.beginPath()
      line.forEach(([x, y], i) => (i ? context.lineTo(x, y) : context.moveTo(x, y)))
      context.stroke()
      for (const point of lane.points) {
        const x = xOfBeat(axis, point.beat)
        if (x < -4 || x > visible + 4) continue
        context.fillStyle = selected.has(point.id) ? accent : text
        context.beginPath()
        context.arc(x, yOfValue(point.value), selected.has(point.id) ? 3.5 : 2.5, 0, Math.PI * 2)
        context.fill()
      }
      if (box) {
        const [x0, x1] = [xOfBeat(axis, box.from.beat), xOfBeat(axis, box.to.beat)]
        const [y0, y1] = [yOfValue(box.from.value), yOfValue(box.to.value)]
        context.globalAlpha = 1
        context.strokeStyle = accent
        context.lineWidth = 1
        context.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0))
      }
    }
    const schedule = () => {
      if (!request) request = requestAnimationFrame(draw)
    }
    schedule()
    scroll.addEventListener('scroll', schedule, { passive: true })
    const observer = new ResizeObserver(schedule)
    observer.observe(scroll)
    return () => {
      scroll.removeEventListener('scroll', schedule)
      observer.disconnect()
      if (request) cancelAnimationFrame(request)
    }
  }, [scroller, pxPerBeat, lane, selected, box, stepped, reason, colors])

  /** The axis of the visible timeline now, and the pointer on it. */
  const axisNow = () => timelineAxis(scroller.current?.scrollLeft ?? 0, canvas.current?.clientWidth ?? 1, pxPerBeat)
  const pointer = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left, y = event.clientY - rect.top
    return { x, y, at: { beat: beatAtX(axisNow(), x), value: valueAtY(y) } }
  }
  /** The grid and the marks, as region drags snap; Alt (passed with the keys) to nothing. */
  const grid = (): PointGrid => {
    const axis = axisNow()
    const snapping = timelineSnapping(useProjectStore.getState().project, '')
    return { step: 0, length: MAX_TIMELINE_BEATS, snap: (beat) => snapBeat(beat, gridBeats(useArrangementView.getState().grid), snapping, axis) }
  }
  const keysOf = (event: PointerEvent) => ({ shift: event.shiftKey, command: event.metaKey || event.ctrlKey, alt: event.altKey })

  const down = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    const { x, y, at } = pointer(event)
    const result = pressPoints(lane.points, pointAt(lane.points, axisNow(), x, y), at, keysOf(event), selected, grid(), newPointId)
    const gestureKey = automationGestureKey()
    setSelected(result.selected)
    drag.current = result.gesture && { key: gestureKey, gesture: result.gesture }
    if (result.gesture?.kind === 'box') setBox({ from: at, to: at })
    if (result.changed) editPoints(owner, lane.id, result.points, gestureKey)
  }
  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    const active = drag.current
    if (!active) return
    const { at } = pointer(event)
    const result = dragPoints(active.gesture, at, keysOf(event), grid())
    if (active.gesture.kind === 'box') {
      setBox({ from: active.gesture.from, to: at })
      setSelected(result.selected)
    } else if (result.points) editPoints(owner, lane.id, result.points, active.key)
  }
  const end = () => {
    drag.current = null
    setBox(null)
  }
  const keyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const command = event.metaKey || event.ctrlKey
    const letter = event.key.toLowerCase()
    const take = () => { event.preventDefault(); event.stopPropagation() }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      // Always the points': Delete on the lane's body never deletes the lane.
      take()
      if (selected.size) { editPoints(owner, lane.id, removePoints(lane.points, selected)); setSelected(new Set()) }
    } else if (event.key === 'Escape' && selected.size) { take(); setSelected(new Set()) }
    else if (command && letter === 'a') { take(); setSelected(new Set(lane.points.map((point) => point.id))) }
    else if (command && (letter === 'c' || letter === 'x')) {
      take()
      const points = copyPoints(lane.points, selected)
      if (points.length) pointClipboard.set(points)
      if (letter === 'x' && selected.size) { editPoints(owner, lane.id, removePoints(lane.points, selected)); setSelected(new Set()) }
    } else if (command && letter === 'v' && copied.length) {
      take()
      const { points, pasted } = pastePoints(lane.points, copied, useArrangementView.getState().position, MAX_TIMELINE_BEATS, newPointId)
      editPoints(owner, lane.id, points)
      setSelected(pasted)
    }
  }

  return (
    <div className={`${styles.lane} ${styles.automationLane}`} data-timeline-lane={lane.id}>
      <ActionMenu subject={{ kind: 'timeline-lane', owner, laneId: lane.id }}>
        <div className={`${styles.header} ${styles.automationHeader}`} style={{ paddingInlineStart: 18 + depth * 10 } as CSSProperties}>
          <input
            type="checkbox"
            aria-label={`Enable ${label}`}
            checked={lane.enabled}
            onChange={(event) => editTimelineAutomation(owner, currentLanes(owner).map((candidate) => (candidate.id === lane.id ? { ...candidate, enabled: event.target.checked } : candidate)))}
          />
          <span className={styles.headerName} tabIndex={0} title={reason ? `${label}: ${reason}` : label}>
            {label}
          </span>
          {reason && <span className={styles.laneNote} title={reason} aria-label={reason}>!</span>}
          {recording && <span className={styles.laneRecording} title="Touch recording" aria-label="Touch recording"><Icon name="record" filled size={14} /></span>}
          {overridden && (
            <button className={styles.readButton} title="Give the control back to its lane" onClick={() => readLane(lane.target)}>
              Read
            </button>
          )}
        </div>
      </ActionMenu>
      <div className={`${styles.row} ${styles.automationRow}`} style={{ width }}>
        <ActionMenu subject={{ kind: 'timeline-lane', owner, laneId: lane.id, ...(menuBeat !== undefined && { beat: menuBeat }) }}>
          <canvas
            ref={canvas}
            className={styles.laneCanvas}
            role="application"
            aria-label={`${label} lane`}
            tabIndex={0}
            data-beats={lane.points.map((point) => point.beat).join(',')}
            data-selected-count={selected.size}
            data-holds={lane.points.filter((point) => point.interpolation === 'hold').length}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            onLostPointerCapture={end}
            onKeyDown={keyDown}
            onContextMenu={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              setMenuBeat(beatAtX(axisNow(), event.clientX - rect.left))
            }}
          />
        </ActionMenu>
      </div>
    </div>
  )
}

/** A target's name for the picker. */
const targetName = (project: Parameters<typeof controlTargetLabel>[0], target: ControlTarget) => controlTargetLabel(project, target)

/** The row under an owner's lanes: *+ Lane*, which opens a picker of the owner's targets that have no lane yet. */
const AddLaneRow = ({ owner, name, lanes, width, depth }: { owner: ControlOwner; name: string; lanes: readonly AutomationLane[]; width: number; depth: number }) => {
  const project = useProjectStore((state) => state.project)
  const [picking, setPicking] = useState(false)
  const [search, setSearch] = useState('')
  const taken = new Set(lanes.map((lane) => controlTargetKey(lane.target)))
  const ownerKey = automationOwnerKey(owner)
  const targets = picking
    ? enumerateControlTargets(project).filter((target) => {
        if (automationOwnerKey(target.owner) !== ownerKey || taken.has(controlTargetKey(target))) return false
        const resolved = resolveControlTarget(project, target)
        return resolved.status === 'available' && resolved.automatable && targetName(project, target).toLowerCase().includes(search.toLowerCase())
      })
    : []
  const add = (target: ControlTarget) => {
    editTimelineAutomation(owner, [...currentLanes(owner), { id: crypto.randomUUID(), target, enabled: true, points: [] }])
    setPicking(false)
    setSearch('')
  }
  // An instrument track's pitch bend, pressure and CCs come after its other controls, under their own heading.
  const others = targets.flatMap((target, index) => (target.kind === 'expression' ? [] : [{ target, index }]))
  const midi = targets.flatMap((target, index) => (target.kind === 'expression' ? [{ target, index }] : []))
  const instrument = owner.kind === 'track' && project.tracks.find((track) => track.id === owner.trackId)?.kind === 'instrument' ? owner.trackId : undefined
  const option = ({ target, index }: { target: ControlTarget; index: number }) => (
    <option key={controlTargetKey(target)} value={index}>
      {targetName(project, target)}
    </option>
  )
  return (
    <div className={`${styles.lane} ${styles.addLane}`}>
      <div className={`${styles.header} ${styles.addLaneHeader}`} style={{ paddingInlineStart: 18 + depth * 10 } as CSSProperties}>
        <button aria-expanded={picking} aria-label={`Add an automation lane to ${name}`} onClick={() => setPicking(!picking)}>
          + Lane
        </button>
      </div>
      <div className={`${styles.row} ${styles.addLaneRow}`} style={{ width }}>
        {picking && (
          <div className={styles.lanePicker} role="group" aria-label={`Automation targets of ${name}`}>
            <input autoFocus aria-label="Search automation targets" placeholder="Search targets…" value={search} onChange={(event) => setSearch(event.target.value)} />
            <select
              aria-label={`Target for a new lane of ${name}`}
              value=""
              onChange={(event) => {
                const target = targets[Number(event.target.value)]
                if (target) add(target)
              }}
            >
              <option value="" disabled>
                {targets.length ? `${targets.length} target${targets.length === 1 ? '' : 's'}…` : 'No target left'}
              </option>
              {others.map(option)}
              {midi.length > 0 && <optgroup label="MIDI">{midi.map(option)}</optgroup>}
            </select>
            {instrument && <CcLaneField trackId={instrument} lanes={lanes} onAdd={add} />}
            <button onClick={() => setPicking(false)}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  )
}
