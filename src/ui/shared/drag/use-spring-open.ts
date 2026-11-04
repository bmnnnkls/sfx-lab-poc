import { type DragEvent, type HTMLAttributes, useEffect, useRef } from 'react'
import { dragging, ourDrag } from './current-drag'
import { SPRING_LOAD_MS } from './use-spring-load'

type SpringProps = Pick<HTMLAttributes<HTMLElement>, 'onDragOver' | 'onDragLeave' | 'onDrop'>

/**
 * The props that spring a collapsed row open, as macOS's spring-loaded folders do: while a drag of ours rests on the
 * element for `SPRING_LOAD_MS`, `open` is called. Leaving the element, dropping or ending the drag first cancels it.
 * A null `open` (a row that is open already, or has nothing in it) does nothing.
 */
export const useSpringOpen = (open: (() => void) | null): SpringProps => {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef(open)
  latest.current = open
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => cancel, [])
  return {
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!ourDrag(event) || !latest.current || timer.current) return
      timer.current = setTimeout(() => {
        timer.current = null
        if (dragging()) latest.current?.()
      }, SPRING_LOAD_MS)
    },
    onDragLeave: (event: DragEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) cancel()
    },
    onDrop: cancel,
  }
}

type Handler = ((event: DragEvent<HTMLElement>) => void) | undefined

/**
 * Several sets of drag props on one element, each handler running in the order given: a row that is a drag source,
 * a drop target and springs open. Components outside this folder spread the result, never naming a drag handler.
 */
export const mergeDragProps = (...sets: readonly Partial<Record<string, unknown>>[]): HTMLAttributes<HTMLElement> => {
  const merged: Record<string, unknown> = {}
  for (const set of sets) {
    for (const [key, value] of Object.entries(set)) {
      const before = merged[key]
      merged[key] = typeof value === 'function' && typeof before === 'function'
        ? (event: DragEvent<HTMLElement>) => { (before as Handler)?.(event); (value as Handler)?.(event) }
        : value
    }
  }
  return merged as HTMLAttributes<HTMLElement>
}
