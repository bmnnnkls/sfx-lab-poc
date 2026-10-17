import { type FocusEvent, type SyntheticEvent, useRef, useEffect } from 'react'
import { createControlGesture } from '@state'
/** Capture starts before widgets write; bubbling ends after throttled final changes flush. */
export const useControlGesture = () => {
  const ref = useRef<ReturnType<typeof createControlGesture> | null>(null)
  const gesture = ref.current ??= createControlGesture()
  useEffect(() => () => gesture.end(), [gesture])
  const stamp = (event: SyntheticEvent) => gesture.stamp(event.timeStamp)
  const begin = (event: SyntheticEvent) => { stamp(event); gesture.begin() }
  const end = (event: SyntheticEvent) => gesture.end(event.timeStamp)
  return { change: gesture.change, events: {
    onPointerDownCapture: begin,
    onPointerMoveCapture: stamp,
    onInputCapture: stamp,
    onWheelCapture: stamp,
    onPointerUp: end,
    onPointerCancel: end,
    onLostPointerCapture: end,
    onKeyDownCapture: begin,
    onKeyUp: end,
    onBlur: (event: FocusEvent<HTMLElement>) => { if (!event.currentTarget.contains(event.relatedTarget)) gesture.end() },
  } }
}
