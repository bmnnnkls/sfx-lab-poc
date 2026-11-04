import { frameCount, moveLoop, moveMarker, updateRegion } from '@core'
import {
  type Subject,
  type WaveAt,
  type WaveAudio,
  goToWaveFrame,
  openWave,
  runAction,
  selectWaveRange,
  useProjectStore,
  useWaveEditorStore,
  waveViewOf,
} from '@state'
import { type MouseEvent, type PointerEvent, useEffect, useRef } from 'react'
import { useActionContext } from '../shared/menu'
import { currentView } from './current-view'
import { type MarkEdge, type MarkHit, markAt, markEdgeAt, marksOf } from './mark-geometry'
import type { WaveSnap } from './snap'
import { autoScrollFrames, frameAt, resolveView } from './wave-geometry'

/** A press that moves less than this is a click, not a drag. */
const DRAG_PX = 3

/** What a press in the mark lane holds: a marker or an edge to drag, or nothing (a click). */
type Grip = { readonly kind: 'marker'; readonly id: string } | MarkEdge | null

interface Press {
  readonly grip: Grip
  readonly hit: MarkHit
  readonly startX: number
  moved: boolean
  /** Where the pointer is now, from the lane's left edge. */
  x: number
  /** Alt is held: the grip doesn't snap. */
  alt: boolean
  /** The auto-scroll's animation frame while the pointer is past an edge. */
  scrolling: number
}

/** The subject of what the pointer is on, for the lane's menu and keys: the mark, or the selection over empty lane. */
export const subjectOfHit = ({ sampleId, pane }: WaveAt, hit: MarkHit): Subject =>
  hit?.kind === 'marker'
    ? { kind: 'sample-marker', sampleId, pane, markerId: hit.id }
    : hit?.kind === 'region'
      ? { kind: 'sample-region', sampleId, pane, regionId: hit.id }
      : hit?.kind === 'loop'
        ? { kind: 'sample-loop', sampleId, pane }
        : { kind: 'sample-selection', sampleId, pane }

/**
 * The mark lane's mouse: drag a marker to move it, or a region's or the loop's edge to move that edge, each drag one
 * undo step (its merge key); dragged past the lane's edge, the view scrolls, as a selection drag does. A click on a
 * region or the loop selects it, on a marker puts the cursor there, on empty lane puts the cursor there. A double-click
 * on a marker or region renames it in place. `onSubject` hears what each press is on, for the lane's menu and keys.
 * A drag and a click on empty lane snap (`snap`; not to what is being moved), unless Alt is held.
 */
export const useMarkGestures = (wave: WaveAudio, onSubject: (subject: Subject) => void, snap: WaveSnap = (frame) => frame) => {
  const { viewKey, audio, sampleId } = wave
  const frames = frameCount(audio)
  const context = useActionContext()
  const press = useRef<Press | null>(null)

  const stopScrolling = () => {
    if (press.current?.scrolling) cancelAnimationFrame(press.current.scrolling)
    if (press.current) press.current.scrolling = 0
  }
  useEffect(() => () => stopScrolling(), [])

  const marks = () => {
    const open = openWave(wave)
    return open ? marksOf(open.sample) : { markers: [], regions: [], loop: null }
  }
  const xOfEvent = (event: MouseEvent<HTMLElement>) => event.clientX - event.currentTarget.getBoundingClientRect().left
  const frameOf = (element: HTMLElement, x: number, alt = true, ignore?: string) => {
    const view = currentView(element, wave)
    return snap(frameAt(view, x, frames), view, alt, ignore)
  }
  const keyOfGrip = (grip: NonNullable<Grip>) => (grip.kind === 'marker' ? `marker:${grip.id}` : grip.kind === 'region' ? `region:${grip.id}:${grip.edge}` : `loop:${grip.edge}`)

  /** Moves what the press holds to column `x`, as one undo step for the whole drag. */
  const moveTo = (element: HTMLElement, grip: NonNullable<Grip>, x: number, alt: boolean) => {
    const frame = frameOf(element, x, alt, keyOfGrip(grip))
    const store = useProjectStore.getState()
    const edge = grip.kind === 'marker' ? {} : grip.edge === 'from' ? { from: frame } : { to: frame }
    if (grip.kind === 'marker') return store.editSampleMarks(sampleId, (info) => moveMarker(info, grip.id, frame), `marker:${viewKey}:${grip.id}`)
    if (grip.kind === 'region') return store.editSampleMarks(sampleId, (info) => updateRegion(info, grip.id, edge), `region:${viewKey}:${grip.id}:${grip.edge}`)
    return store.editSampleMarks(sampleId, (info) => moveLoop(info, edge), `loop:${viewKey}:${grip.edge}`)
  }

  /** Follows the pointer; past an edge, scrolls a step each animation frame and moves the grip to that edge. */
  const follow = (element: HTMLElement) => {
    const current = press.current
    if (!current?.grip) return
    const grip = current.grip
    const width = element.clientWidth
    if (current.x >= 0 && current.x <= width) {
      stopScrolling()
      return moveTo(element, grip, current.x, current.alt)
    }
    if (current.scrolling) return
    const step = () => {
      const now = press.current
      if (!now) return
      const store = useWaveEditorStore.getState()
      const stored = waveViewOf(store.views, viewKey)
      const view = currentView(element, wave)
      const distance = now.x < 0 ? now.x : now.x > view.width ? now.x - view.width : 0
      if (distance === 0) return void (now.scrolling = 0)
      // A fitted view shows the whole sample: nothing to scroll.
      if (stored.framesPerPixel !== null) {
        const next = resolveView({ ...stored, startFrame: view.startFrame + autoScrollFrames(distance, view.framesPerPixel, view.width) }, frames, view.width)
        store.setView(viewKey, { startFrame: next.startFrame })
      }
      moveTo(element, grip, distance < 0 ? 0 : view.width, true)
      now.scrolling = requestAnimationFrame(step)
    }
    current.scrolling = requestAnimationFrame(step)
  }

  const end = (event: PointerEvent<HTMLElement>) => {
    stopScrolling()
    press.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  /** A click: a region or the loop selects it, a marker or empty lane puts the cursor there. */
  const click = (element: HTMLElement, hit: MarkHit, x: number, alt: boolean) => {
    if (hit?.kind === 'region') {
      const region = marks().regions.find((candidate) => candidate.id === hit.id)
      if (region) selectWaveRange(wave, region)
    } else if (hit?.kind === 'loop') {
      const loop = marks().loop
      if (loop) selectWaveRange(wave, loop)
    } else if (hit?.kind === 'marker') {
      const marker = marks().markers.find((candidate) => candidate.id === hit.id)
      if (marker) goToWaveFrame(wave, marker.frame)
    } else {
      const store = useWaveEditorStore.getState()
      store.select(viewKey, null)
      store.setView(viewKey, { cursor: frameOf(element, x, alt) })
    }
  }

  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      const element = event.currentTarget
      element.focus({ preventScroll: true })
      const x = xOfEvent(event)
      const view = currentView(element, wave)
      const hit = markAt(view, marks(), x)
      onSubject(subjectOfHit(wave, hit))
      if (event.button !== 0) return
      // A marker is drawn over the edges, so it is what a press there takes.
      const grip: Grip = hit?.kind === 'marker' ? hit : markEdgeAt(view, marks(), x)
      press.current = { grip, hit, startX: event.clientX, moved: false, x, alt: event.altKey, scrolling: 0 }
      element.setPointerCapture(event.pointerId)
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const element = event.currentTarget
      const current = press.current
      if (!current) {
        // Over an edge the pointer says it can be dragged; over a marker, that it can be moved.
        const view = currentView(element, wave)
        const x = xOfEvent(event)
        const hit = markAt(view, marks(), x)
        element.style.cursor = hit?.kind === 'marker' ? 'grab' : markEdgeAt(view, marks(), x) ? 'ew-resize' : ''
        return
      }
      current.x = xOfEvent(event)
      current.alt = event.altKey
      if (!current.grip || (!current.moved && Math.abs(event.clientX - current.startX) < DRAG_PX)) return
      current.moved = true
      follow(element)
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      const current = press.current
      end(event)
      if (current && !current.moved) click(event.currentTarget, current.hit, current.x, event.altKey)
    },
    onPointerCancel: end,
    onDoubleClick: (event: MouseEvent<HTMLElement>) => {
      if (event.button !== 0) return
      const hit = markAt(currentView(event.currentTarget, wave), marks(), xOfEvent(event))
      if (hit?.kind === 'marker' || hit?.kind === 'region') void runAction(`sample-${hit.kind}.rename`, subjectOfHit(wave, hit), context)
    },
    /** The right-click's subject, before the menu opens. */
    onContextMenu: (event: MouseEvent<HTMLElement>) => {
      const hit = markAt(currentView(event.currentTarget, wave), marks(), xOfEvent(event))
      onSubject(subjectOfHit(wave, hit))
      if (!hit) {
        // Over empty lane the menu is the selection's: it acts at the cursor, put where the click was.
        const store = useWaveEditorStore.getState()
        const frame = frameOf(event.currentTarget, xOfEvent(event))
        const { selection } = waveViewOf(store.views, viewKey)
        if (!selection || frame < selection.from || frame > selection.to) {
          store.select(viewKey, null)
          store.setView(viewKey, { cursor: frame })
        }
      }
    },
  }
}
