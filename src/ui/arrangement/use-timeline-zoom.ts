import { ARRANGEMENT_ZOOM, type TimelineZoom, useArrangementView } from '@state'
import { type RefObject, useEffect, useLayoutEffect, useRef } from 'react'
import { WHEEL_ZOOM } from '../shared/timeline'

/** The visible timeline in a scroller: where it starts (after the header column) and how wide it is, in pixels. */
export const visibleTimeline = (scroller: HTMLElement): { readonly left: number; readonly width: number } => {
  const corner = scroller.querySelector<HTMLElement>('[data-corner]')
  const left = corner?.offsetWidth ?? 0
  return { left, width: Math.max(1, scroller.clientWidth - left) }
}

/** The farthest zoom out: the whole timeline (`lengthBeats`) in the visible width, but never below the store's bound. */
export const minPxPerBeat = (lengthBeats: number, visibleWidth: number): number =>
  Math.min(ARRANGEMENT_ZOOM.max, Math.max(ARRANGEMENT_ZOOM.min, visibleWidth / Math.max(1, lengthBeats)))

/** The zoom and scroll a requested zoom gives: the whole timeline from 0, or the range across the width. */
export const zoomFor = (zoom: TimelineZoom, fitBeats: number, visibleWidth: number, minPx: number): { readonly pxPerBeat: number; readonly scrollLeft: number } => {
  const clamp = (px: number) => Math.min(ARRANGEMENT_ZOOM.max, Math.max(minPx, px))
  if (zoom === 'fit') return { pxPerBeat: clamp(visibleWidth / Math.max(1, fitBeats)), scrollLeft: 0 }
  const pxPerBeat = clamp(visibleWidth / Math.max(0.25, zoom.to - zoom.from))
  return { pxPerBeat, scrollLeft: Math.max(0, zoom.from * pxPerBeat) }
}

/**
 * The timeline's zoom and pan: ⌘ or Ctrl with the wheel (and a pinch, which browsers send as one) zooms around the
 * pointer, a middle-drag pans both ways, and a zoom asked of the store (*Zoom to fit*, *Zoom to selection*) is applied
 * once the view knows its width. A zoom keeps the beat under its anchor where it was, by setting `scrollLeft` after the
 * lanes have their new width. `lengthBeats` is the drawn timeline's length; `fitBeats` what *Zoom to fit* shows.
 */
export const useTimelineZoom = (scroller: RefObject<HTMLDivElement | null>, lengthBeats: number, fitBeats: number): ((pxPerBeat: number, x?: number) => void) => {
  const pxPerBeat = useArrangementView((state) => state.pxPerBeat)
  const zoomTo = useArrangementView((state) => state.zoomTo)
  /** The beat to keep at a column of the visible timeline once the new zoom is drawn. */
  const anchor = useRef<{ beat: number; x: number } | null>(null)
  const scrollTo = useRef<number | null>(null)
  const length = useRef(lengthBeats)
  length.current = lengthBeats

  // After the lanes are drawn at the new zoom: put the anchored beat back under its column, or scroll where asked.
  useLayoutEffect(() => {
    const element = scroller.current
    if (!element) return
    if (anchor.current) {
      element.scrollLeft = Math.max(0, anchor.current.beat * pxPerBeat - anchor.current.x)
      anchor.current = null
    } else if (scrollTo.current !== null) {
      element.scrollLeft = scrollTo.current
      scrollTo.current = null
    }
  }, [scroller, pxPerBeat])

  // A zoom asked for: applied here, where the width is known.
  useLayoutEffect(() => {
    const element = scroller.current
    if (!element || !zoomTo) return
    const zoom = useArrangementView.getState().takeZoom()
    if (!zoom) return
    const { width } = visibleTimeline(element)
    const next = zoomFor(zoom, fitBeats, width, minPxPerBeat(lengthBeats, width))
    if (next.pxPerBeat === useArrangementView.getState().pxPerBeat) element.scrollLeft = next.scrollLeft
    else {
      scrollTo.current = next.scrollLeft
      useArrangementView.getState().setZoom(next.pxPerBeat)
    }
  }, [scroller, zoomTo, fitBeats, lengthBeats])

  /** Zooms to `next` pixels per beat (kept in range), keeping the beat at column `x` of the visible timeline there. */
  const zoomAt = (element: HTMLElement, next: number, x: number) => {
    const store = useArrangementView.getState()
    const { width } = visibleTimeline(element)
    const pxPerBeat = Math.min(ARRANGEMENT_ZOOM.max, Math.max(minPxPerBeat(length.current, width), next))
    if (pxPerBeat === store.pxPerBeat) return
    anchor.current = { beat: (element.scrollLeft + x) / store.pxPerBeat, x }
    store.setZoom(pxPerBeat)
  }
  const zoomRef = useRef(zoomAt)
  zoomRef.current = zoomAt

  useEffect(() => {
    const element = scroller.current
    if (!element) return
    const zoomAt = (target: HTMLElement, next: number, x: number) => zoomRef.current(target, next, x)
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      // Not the page's zoom.
      event.preventDefault()
      const { left, width } = visibleTimeline(element)
      const x = Math.min(width, Math.max(0, event.clientX - element.getBoundingClientRect().left - left))
      zoomAt(element, useArrangementView.getState().pxPerBeat / WHEEL_ZOOM ** (event.deltaY / 100), x)
    }
    // The middle button pans, before anything else sees the press (and before the browser's own auto-scroll).
    let pan: { x: number; y: number; left: number; top: number; pointer: number } | null = null
    const onDown = (event: PointerEvent) => {
      if (event.button !== 1) return
      event.preventDefault()
      event.stopPropagation()
      pan = { x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop, pointer: event.pointerId }
      element.setPointerCapture(event.pointerId)
      element.style.cursor = 'grabbing'
    }
    const onMove = (event: PointerEvent) => {
      if (!pan || event.pointerId !== pan.pointer) return
      element.scrollLeft = pan.left - (event.clientX - pan.x)
      element.scrollTop = pan.top - (event.clientY - pan.y)
    }
    const onUp = (event: PointerEvent) => {
      if (!pan || event.pointerId !== pan.pointer) return
      pan = null
      element.style.cursor = ''
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId)
    }
    // A middle click would otherwise paste on Linux or open the auto-scroll cursor.
    const onAux = (event: MouseEvent) => {
      if (event.button === 1) event.preventDefault()
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    element.addEventListener('pointerdown', onDown, { capture: true })
    element.addEventListener('pointermove', onMove)
    element.addEventListener('pointerup', onUp)
    element.addEventListener('pointercancel', onUp)
    element.addEventListener('auxclick', onAux)
    return () => {
      element.removeEventListener('wheel', onWheel)
      element.removeEventListener('pointerdown', onDown, { capture: true })
      element.removeEventListener('pointermove', onMove)
      element.removeEventListener('pointerup', onUp)
      element.removeEventListener('pointercancel', onUp)
      element.removeEventListener('auxclick', onAux)
    }
  }, [scroller])

  // Around column `x`, or the middle of the visible timeline.
  return (next, x) => {
    const element = scroller.current
    if (element) zoomAt(element, next, x ?? visibleTimeline(element).width / 2)
  }
}
