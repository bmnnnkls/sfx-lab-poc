import { type DragEvent, type HTMLAttributes, useRef } from 'react'
import { ourDrag } from './current-drag'

/** How long a drag rests on a tab before its view shows, as macOS's spring-loaded folders open. */
export const SPRING_LOAD_MS = 500

type SpringProps = Pick<HTMLAttributes<HTMLElement>, 'onDragOver' | 'onDragLeave' | 'onDrop'>

/**
 * The props that spring-load what is inside an element: while a drag of ours rests on something `at` names (a tab's
 * view) for half a second, `open` is called with it. Moving off it first cancels. Other drags (flexlayout's own tab
 * drags, files) pass by. Listens on the element, so the things it names need no handlers of their own.
 */
export const useSpringLoad = <K>(at: (element: Element) => K | undefined, open: (key: K) => void): SpringProps => {
  const pending = useRef<{ key: K; timer: ReturnType<typeof setTimeout> } | null>(null)
  const cancel = () => {
    if (pending.current) clearTimeout(pending.current.timer)
    pending.current = null
  }
  const keyOf = (target: EventTarget | null) => (target instanceof Element ? at(target) : undefined)
  return {
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!ourDrag(event)) return
      const key = keyOf(event.target)
      if (key === pending.current?.key) return
      cancel()
      if (key === undefined) return
      const timer = setTimeout(() => {
        pending.current = null
        open(key)
      }, SPRING_LOAD_MS)
      pending.current = { key, timer }
    },
    onDragLeave: (event: DragEvent<HTMLElement>) => {
      if (pending.current && keyOf(event.relatedTarget) !== pending.current.key) cancel()
    },
    onDrop: cancel,
  }
}
