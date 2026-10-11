import { type RefObject, useEffect, useState } from 'react'

/** The rendered width of an element, kept up to date as it resizes. */
export const useElementWidth = (ref: RefObject<HTMLElement | null>, fallback = 600): number => {
  const [width, setWidth] = useState(fallback)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    setWidth(Math.max(1, Math.floor(element.clientWidth)))
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(1, Math.floor(entry.contentRect.width)))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return width
}
