import { type PointerEvent, useRef } from 'react'

/** Pointer handlers that drag a node by its header, clamped to the canvas origin. */
export const useNodeDrag = (x: number, y: number, onMove: (x: number, y: number) => void) => {
  const origin = useRef<{ px: number; py: number; x: number; y: number } | null>(null)

  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return
      event.currentTarget.setPointerCapture(event.pointerId)
      origin.current = { px: event.clientX, py: event.clientY, x, y }
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const start = origin.current
      if (!start) return
      onMove(
        Math.max(0, start.x + event.clientX - start.px),
        Math.max(0, start.y + event.clientY - start.py),
      )
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      origin.current = null
      event.currentTarget.releasePointerCapture(event.pointerId)
    },
  }
}
