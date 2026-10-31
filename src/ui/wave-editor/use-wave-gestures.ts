import { frameCount } from '@core'
import { type WaveAudio, type WaveChannels, type WaveSelection, openWave, useWaveEditorStore, waveViewOf } from '@state'
import { type MouseEvent, type PointerEvent, useEffect, useRef } from 'react'
import { currentView } from './current-view'
import { type LanePart, type LanePartKind, laneParts, partBox } from './lane-renderers'
import type { WaveSnap } from './snap'
import type { FrequencyScale } from './use-lane-renderers'
import { autoScrollFrames, boxEdgeAt, boxEdgeCursor, frameAt, resolveView, selectionEdgeAt } from './wave-geometry'

/** A press that moves less than this is a click (sets the cursor), not a drag (selects). */
const DRAG_PX = 3

/** Which channels a press selects: on a stereo sample, the top quarter of the left lane is left only, the bottom quarter of the right lane right only. */
export const channelsAt = (element: HTMLElement, clientY: number, stereo: boolean): WaveChannels => {
  if (!stereo) return 'both'
  const box = element.getBoundingClientRect()
  const lane = box.height / 2
  const y = clientY - box.top
  if (y < lane / 4) return 'left'
  if (y > box.height - lane / 4) return 'right'
  return 'both'
}

/** The lane under the pointer: 0 (left, or the only one) or 1 (right). */
export const laneAt = (element: HTMLElement, clientY: number, stereo: boolean): number => {
  if (!stereo) return 0
  const box = element.getBoundingClientRect()
  return clientY - box.top < box.height / 2 ? 0 : 1
}

/** Where a point is in its lane: the lane, the part of it there, and the row in that part, `height` high. */
export interface LaneSpot {
  readonly lane: number
  readonly kind: LanePartKind
  readonly y: number
  readonly height: number
}

/** The part of a lane `height` px high at row `y` from its top, and the row in it; above the lane the first, below it the last. */
export const partAt = (parts: readonly LanePart[], y: number, height: number): Omit<LaneSpot, 'lane'> => {
  let found = { kind: parts[0]!.kind, ...partBox(parts[0]!, height) }
  for (const part of parts) {
    const box = partBox(part, height)
    if (y >= box.top) found = { kind: part.kind, ...box }
  }
  return { kind: found.kind, y: y - found.top, height: found.height }
}

/** The lane's canvas box: the lanes are the detail's canvases, in channel order. */
const laneBox = (element: HTMLElement, lane: number) => (element.querySelectorAll('canvas')[lane] ?? element).getBoundingClientRect()

/** Where `clientY` is on lane `lane` (the one under it unless given). */
export const spotAt = (element: HTMLElement, clientY: number, stereo: boolean, parts: readonly LanePart[], lane = laneAt(element, clientY, stereo)): LaneSpot => {
  const box = laneBox(element, lane)
  return { lane, ...partAt(parts, clientY - box.top, box.height) }
}

/** The row of `clientY` in lane `lane`'s spectrogram part, past its edges too; null when the lanes show none. */
const spectrogramRow = (element: HTMLElement, clientY: number, lane: number, parts: readonly LanePart[]) => {
  const part = parts.find((candidate) => candidate.kind === 'spectrogram')
  if (!part) return null
  const box = laneBox(element, lane)
  const inPart = partBox(part, box.height)
  return { y: clientY - box.top - inPart.top, height: inPart.height }
}

/**
 * A selection being dragged: `make` is the selection with the moving end at a frame (snapped) and the pointer at
 * `clientY` (a box's band); the pointer may be past the detail's edge (auto-scroll).
 */
interface Drag {
  /** The frame pressed: a click puts the cursor there. */
  readonly pressed: number
  readonly startX: number
  readonly make: (frame: number, clientY: number) => WaveSelection
  moved: boolean
  /** Where the pointer is now, from the detail's left edge, and on the page. */
  x: number
  clientY: number
  /** Alt is held: the moving end doesn't snap. */
  alt: boolean
  /** The auto-scroll's animation frame while the pointer is past an edge. */
  scrolling: number
}

const WAVEFORM_ONLY = laneParts('waveform')
const NO_SCALE: FrequencyScale = { rowOf: () => 0, hzAt: () => 0 }

/**
 * The lanes' mouse: a drag selects (Shift extends from the far end; a press on a selection's edge drags that edge), a
 * click sets the cursor, a double-click selects the whole sample on the channels a drag would take, and a middle-drag
 * pans. A drag that starts in a spectrogram part selects a box, in time and frequency, on the lane it starts in (both
 * once it is on the other); a box's edges and corners drag, and Shift extends it in time. A selection dragged past the
 * detail's left or right edge scrolls the view, faster the further past it. The pointer shows a resize cursor over a
 * selection's edge and a grabbing hand while panning, set on the element, not through React. A click's cursor and a
 * drag's moving end snap (`snap`), unless Alt is held; a band doesn't snap.
 */
export const useWaveGestures = (
  wave: WaveAudio,
  snap: WaveSnap = (frame) => frame,
  parts: readonly LanePart[] = WAVEFORM_ONLY,
  frequencies: FrequencyScale = NO_SCALE,
) => {
  const { viewKey, audio } = wave
  const frames = frameCount(audio)
  const stereo = audio.channels.length > 1
  const drag = useRef<Drag | null>(null)
  const pan = useRef<{ startX: number; startFrame: number; framesPerPixel: number } | null>(null)

  const stopScrolling = () => {
    if (drag.current?.scrolling) cancelAnimationFrame(drag.current.scrolling)
    if (drag.current) drag.current.scrolling = 0
  }
  useEffect(() => () => stopScrolling(), [])

  const xOfEvent = (event: MouseEvent<HTMLElement>) => event.clientX - event.currentTarget.getBoundingClientRect().left
  const frameOf = (element: HTMLElement, x: number, alt = true) => {
    const view = currentView(element, wave)
    return snap(frameAt(view, x, frames), view, alt)
  }

  /** Selects from the drag's anchor to the pointer; past an edge, scrolls a step each animation frame and selects to that edge. */
  const follow = (element: HTMLElement) => {
    const current = drag.current
    if (!current) return
    const select = (x: number) => useWaveEditorStore.getState().select(viewKey, current.make(frameOf(element, x, current.alt), current.clientY))
    const width = element.clientWidth
    const past = current.x < 0 ? current.x : current.x > width ? current.x - width : 0
    if (past === 0) {
      stopScrolling()
      return select(current.x)
    }
    if (current.scrolling) return
    const step = () => {
      const now = drag.current
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
      select(distance < 0 ? 0 : view.width)
      now.scrolling = requestAnimationFrame(step)
    }
    current.scrolling = requestAnimationFrame(step)
  }

  const end = (event: PointerEvent<HTMLElement>) => {
    stopScrolling()
    drag.current = null
    pan.current = null
    event.currentTarget.style.cursor = ''
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return {
    // The middle button pans, before anything else sees the press (and before the browser's own auto-scroll).
    onPointerDownCapture: (event: PointerEvent<HTMLElement>) => {
      event.currentTarget.focus({ preventScroll: true })
      if (event.button !== 1) return
      event.preventDefault()
      event.stopPropagation()
      const view = currentView(event.currentTarget, wave)
      pan.current = { startX: event.clientX, startFrame: view.startFrame, framesPerPixel: view.framesPerPixel }
      event.currentTarget.style.cursor = 'grabbing'
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return
      const store = useWaveEditorStore.getState()
      const element = event.currentTarget
      const x = xOfEvent(event)
      const at = frameOf(element, x, event.altKey)
      const { selection } = waveViewOf(store.views, viewKey)
      const spot = spotAt(element, event.clientY, stereo, parts)
      /** The frequency at `clientY` in lane `lane`'s spectrogram. */
      const hzOf = (clientY: number, lane: number) => {
        const row = spectrogramRow(element, clientY, lane, parts)
        return row ? frequencies.hzAt(row.y, row.height) : 0
      }
      const start = (make: Drag['make'], moved: boolean) => {
        drag.current = { pressed: at, startX: event.clientX, make, moved, x, clientY: event.clientY, alt: event.altKey, scrolling: 0 }
      }
      const view = currentView(element, wave)
      // In the spectrogram a box's edges drag; elsewhere, and for a selection without a band, its time edges.
      const edge = event.shiftKey || !selection
        ? null
        : spot.kind === 'spectrogram' && selection.band
          ? boxEdgeAt(view, selection, x, spot.y, spot.lane, (hz) => frequencies.rowOf(hz, spot.height))
          : (() => {
              const time = selectionEdgeAt(view, selection, x, spot.lane)
              return time && { time, band: null }
            })()
      if (selection && edge) {
        // The other edges stay where they are.
        const anchor = edge.time === 'from' ? selection.to : selection.from
        const band = selection.band
        const fixedHz = edge.band === 'high' ? band?.low : band?.high
        start(
          (frame, clientY) => ({
            from: edge.time ? anchor : selection.from,
            to: edge.time ? frame : selection.to,
            channels: selection.channels,
            ...(band && { band: edge.band ? { low: fixedHz!, high: hzOf(clientY, spot.lane) } : band }),
          }),
          true,
        )
      } else if (event.shiftKey && selection) {
        // Shift extends the selection in time from its far end, keeping its band.
        const anchor = Math.abs(at - selection.from) > Math.abs(at - selection.to) ? selection.from : selection.to
        start((frame) => ({ from: anchor, to: frame, channels: selection.channels, ...(selection.band && { band: selection.band }) }), true)
        store.select(viewKey, drag.current!.make(at, event.clientY))
      } else if (spot.kind === 'spectrogram') {
        // A box, on the lane it starts in, or both once the pointer is on the other.
        const fromHz = frequencies.hzAt(spot.y, spot.height)
        start((frame, clientY) => {
          const lane = laneAt(element, clientY, stereo)
          const channels: WaveChannels = !stereo || lane !== spot.lane ? 'both' : spot.lane === 0 ? 'left' : 'right'
          return { from: at, to: frame, channels, band: { low: fromHz, high: hzOf(clientY, lane) } }
        }, false)
      } else {
        const channels = channelsAt(element, event.clientY, stereo)
        start((frame) => ({ from: at, to: frame, channels }), false)
      }
      element.setPointerCapture(event.pointerId)
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const element = event.currentTarget
      const panning = pan.current
      if (panning) {
        const stored = waveViewOf(useWaveEditorStore.getState().views, viewKey)
        // A fitted view shows the whole sample: nothing to pan.
        if (stored.framesPerPixel === null) return
        const startFrame = panning.startFrame - (event.clientX - panning.startX) * panning.framesPerPixel
        useWaveEditorStore.getState().setView(viewKey, { startFrame: resolveView({ ...stored, startFrame }, frames, element.clientWidth).startFrame })
        return
      }
      const current = drag.current
      if (!current) {
        // Over a selection's edge or a box's, the pointer says it can be dragged.
        const { selection } = waveViewOf(useWaveEditorStore.getState().views, viewKey)
        const view = currentView(element, wave)
        const spot = spotAt(element, event.clientY, stereo, parts)
        const x = xOfEvent(event)
        if (spot.kind === 'spectrogram' && selection?.band) {
          const edge = boxEdgeAt(view, selection, x, spot.y, spot.lane, (hz) => frequencies.rowOf(hz, spot.height))
          element.style.cursor = edge ? boxEdgeCursor(edge) : ''
        } else element.style.cursor = selectionEdgeAt(view, selection, x, spot.lane) ? 'ew-resize' : ''
        return
      }
      current.x = xOfEvent(event)
      current.clientY = event.clientY
      current.alt = event.altKey
      if (!current.moved && Math.abs(event.clientX - current.startX) < DRAG_PX) return
      current.moved = true
      follow(element)
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      const current = drag.current
      end(event)
      if (current && !current.moved) {
        const store = useWaveEditorStore.getState()
        store.select(viewKey, null)
        store.setView(viewKey, { cursor: current.pressed })
      }
    },
    onPointerCancel: end,
    // Inside a region or the loop, it selects that (the innermost, the shortest); elsewhere, the whole sample.
    onDoubleClick: (event: MouseEvent<HTMLElement>) => {
      if (event.button !== 0) return
      const at = frameAt(currentView(event.currentTarget, wave), xOfEvent(event), frames)
      const sample = openWave(wave)?.sample
      const ranges = [...(sample?.regions ?? []), ...(sample?.loop ? [sample.loop] : [])].filter((range) => range.from <= at && at < range.to)
      const inner = ranges.sort((a, b) => a.to - a.from - (b.to - b.from))[0] ?? { from: 0, to: frames }
      useWaveEditorStore.getState().select(viewKey, { from: inner.from, to: inner.to, channels: channelsAt(event.currentTarget, event.clientY, stereo) })
    },
  }
}
