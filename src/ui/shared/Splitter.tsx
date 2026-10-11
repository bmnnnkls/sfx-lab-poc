import { type KeyboardEvent, type PointerEvent } from 'react'
import styles from './Splitter.module.css'

interface SplitterProps {
  /** Current height of the panel below the splitter, in pixels. */
  size: number
  min: number
  max: number
  onResize(size: number): void
}

const KEYBOARD_STEP = 24

/**
 * A horizontal drag handle that resizes the panel under it: dragging up makes the panel taller.
 * Also a keyboard-operable separator (arrow keys).
 */
export const Splitter = ({ size, min, max, onResize }: SplitterProps) => {
  const clamp = (value: number) => Math.min(max, Math.max(min, Math.round(value)))

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    // The panel is anchored to the bottom of the window, so its height is the distance up from there.
    onResize(clamp(window.innerHeight - event.clientY))
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowUp') onResize(clamp(size + KEYBOARD_STEP))
    else if (event.key === 'ArrowDown') onResize(clamp(size - KEYBOARD_STEP))
    else return
    event.preventDefault()
  }

  return (
    <div
      className={styles.splitter}
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize editor"
      aria-valuenow={size}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onKeyDown={onKeyDown}
    />
  )
}
