import { frameCount } from '@core'
import { type WaveAudio, type WaveChannels, openWave, useWaveEditorStore, waveViewOf } from '@state'
import { type MouseEvent, type PointerEvent, useEffect, useRef } from 'react'
import { currentView } from './current-view'
import type { WaveSnap } from './snap'
import { autoScrollFrames, frameAt, resolveView, selectionEdgeAt } from './wave-geometry'

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

/** A selection being dragged: from `anchor` to the pointer, which may be past the detail's edge (auto-scroll). */
interface Drag {
  readonly anchor: number
  readonly startX: number
  readonly channels: WaveChannels
  moved: boolean
  /** Where the pointer is now, from the detail's left edge. */
  x: number
  /** Alt is held: the moving end doesn't snap. */
  alt: boolean
  /** The auto-scroll's animation frame while the pointer is past an edge. */
  scrolling: number
}

/**
 * The lanes' mouse: a drag selects (Shift extends from the far end; a press on a selection's edge drags that edge), a
 * click sets the cursor, a double-click selects the whole sample on the channels a drag would take, and a middle-drag
 * pans. A selection dragged past the detail's left or right edge scrolls the view, faster the further past it. The
 * pointer shows a resize cursor over a selection's edge and a grabbing hand while panning, set on the element, not
 * through React. A click's cursor and a drag's moving end snap (`snap`), unless Alt is held.
 */
export const useWaveGestures = (wave: WaveAudio, snap: WaveSnap = (frame) => frame) => {
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
    const select = (x: number) => useWaveEditorStore.getState().select(viewKey, { from: current.anchor, to: frameOf(element, x, current.alt), channels: current.channels })
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
      const edge = event.shiftKey ? null : selectionEdgeAt(currentView(element, wave), selection, x, laneAt(element, event.clientY, stereo))
      if (selection && edge) {
        // The other edge stays where it is.
        drag.current = { anchor: edge === 'from' ? selection.to : selection.from, startX: event.clientX, channels: selection.channels, moved: true, x, alt: event.altKey, scrolling: 0 }
      } else {
        // Shift extends the selection from its far end.
        const anchor = event.shiftKey && selection ? (Math.abs(at - selection.from) > Math.abs(at - selection.to) ? selection.from : selection.to) : at
        const channels = event.shiftKey && selection ? selection.channels : channelsAt(element, event.clientY, stereo)
        drag.current = { anchor, startX: event.clientX, channels, moved: event.shiftKey && selection !== null, x, alt: event.altKey, scrolling: 0 }
        if (drag.current.moved) store.select(viewKey, { from: anchor, to: at, channels })
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
        // Over a selection's edge, the pointer says it can be dragged.
        const { selection } = waveViewOf(useWaveEditorStore.getState().views, viewKey)
        const edge = selectionEdgeAt(currentView(element, wave), selection, xOfEvent(event), laneAt(element, event.clientY, stereo))
        element.style.cursor = edge ? 'ew-resize' : ''
        return
      }
      current.x = xOfEvent(event)
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
        store.setView(viewKey, { cursor: current.anchor })
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
