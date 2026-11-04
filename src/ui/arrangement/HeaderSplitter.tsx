import { HEADER_WIDTH, useArrangementView } from '@state'
import { type RefObject, useRef } from 'react'
import styles from './arrangement.module.css'

/** What ← and → move the splitter by, in pixels. */
const KEY_STEP = 10

/**
 * The bar at the right of the header column: a drag sets the column's width, ← and → move it by 10 px, and a
 * double-click returns it to 180 px. A `separator`, like the docking shell's splitters.
 */
export const HeaderSplitter = ({ view }: { view: RefObject<HTMLDivElement | null> }) => {
  const width = useArrangementView((state) => state.headerWidth)
  const left = useRef<number | null>(null)
  const set = (next: number) => useArrangementView.getState().setHeaderWidth(next)
  return (
    <div
      className={styles.headerSplitter}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the track headers"
      aria-valuemin={HEADER_WIDTH.min}
      aria-valuemax={HEADER_WIDTH.max}
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to resize the track headers; double-click for the default"
      onPointerDown={(event) => {
        if (event.button !== 0 || !view.current) return
        left.current = view.current.getBoundingClientRect().left
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (left.current !== null) set(event.clientX - left.current)
      }}
      onPointerUp={(event) => {
        left.current = null
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      }}
      onPointerCancel={() => void (left.current = null)}
      onDoubleClick={() => set(HEADER_WIDTH.initial)}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        set(width + (event.key === 'ArrowLeft' ? -KEY_STEP : KEY_STEP))
      }}
    />
  )
}
