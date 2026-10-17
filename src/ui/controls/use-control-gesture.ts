import { type FocusEvent, useRef } from 'react'
import { createControlGesture } from '@state'
/** Capture starts before widgets write; bubbling ends after throttled final changes flush. */
export const useControlGesture = () => {
  const ref = useRef<ReturnType<typeof createControlGesture> | null>(null)
  const gesture = ref.current ??= createControlGesture()
  return { change: gesture.change, events: {
    onPointerDownCapture: gesture.begin,
    onPointerUp: gesture.end,
    onPointerCancel: gesture.end,
    onLostPointerCapture: gesture.end,
    onKeyDownCapture: gesture.begin,
    onKeyUp: gesture.end,
    onBlur: (event: FocusEvent<HTMLElement>) => { if (!event.currentTarget.contains(event.relatedTarget)) gesture.end() },
  } }
}
