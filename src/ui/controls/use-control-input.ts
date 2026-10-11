import { type PointerEvent, type RefObject, useEffect, useMemo, useRef } from 'react'
import { type FrameThrottle, createFrameThrottle } from './frame-throttle'

/** The latest value of something, readable from handlers that were created earlier. */
const useLatest = <T>(value: T): RefObject<T> => {
  const ref = useRef(value)
  ref.current = value
  return ref
}

/** `onChange` limited to one call per animation frame while dragging; `flush` at the end of a drag so the last value lands. */
export const useThrottledChange = <T>(onChange: (value: T) => void): FrameThrottle<T> => {
  const latest = useLatest(onChange)
  const throttle = useMemo(() => createFrameThrottle<T>((value) => latest.current(value)), [latest])
  useEffect(() => () => throttle.cancel(), [throttle])
  return throttle
}

interface DragHandlers<S> {
  /** Called on the press; what it returns is handed to `onMove` (the position and value at the start). */
  onStart(event: PointerEvent<HTMLElement>): S
  onMove(event: PointerEvent<HTMLElement>, start: S): void
  onEnd?(): void
}

/**
 * Pointer handlers for a drag that keeps following the pointer outside the element (pointer capture). Primary button
 * only; a second finger or a right click does nothing.
 */
export const useDrag = <S>(handlers: DragHandlers<S>) => {
  const latest = useLatest(handlers)
  const start = useRef<{ value: S; pointer: number } | undefined>(undefined)
  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0 || start.current) return
      event.currentTarget.setPointerCapture(event.pointerId)
      // Take focus ourselves: capturing the pointer stops the browser doing it, and the keys need somewhere to go.
      event.currentTarget.focus()
      start.current = { value: latest.current.onStart(event), pointer: event.pointerId }
      event.preventDefault()
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const drag = start.current
      if (drag && drag.pointer === event.pointerId) latest.current.onMove(event, drag.value)
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      if (start.current?.pointer !== event.pointerId) return
      start.current = undefined
      latest.current.onEnd?.()
    },
    onPointerCancel: (event: PointerEvent<HTMLElement>) => {
      if (start.current?.pointer !== event.pointerId) return
      start.current = undefined
      latest.current.onEnd?.()
    },
  }
}

/**
 * A wheel listener that can stop the page from scrolling: React attaches its own wheel handlers as passive, so
 * `preventDefault` has to be done on a native listener.
 */
export const useWheel = (ref: RefObject<HTMLElement | null>, onWheel: (event: WheelEvent) => void) => {
  const latest = useLatest(onWheel)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const listener = (event: WheelEvent) => {
      event.preventDefault()
      latest.current(event)
    }
    element.addEventListener('wheel', listener, { passive: false })
    return () => element.removeEventListener('wheel', listener)
  }, [ref, latest])
}
