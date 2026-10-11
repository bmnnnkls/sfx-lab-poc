import { type KeyboardEvent, useRef } from 'react'
import styles from './controls.module.css'
import { type PadPosition, padNudge, padPosition } from './control-math'
import { useDrag, useThrottledChange } from './use-control-input'

interface XYPadProps {
  label: string
  x: number
  y: number
  /** What both values read, e.g. "X 1.2 kHz, Y 0.40". */
  valueText: string
  defaultX: number
  defaultY: number
  /** One key press, as a fraction of each axis (Shift for a tenth). */
  step?: number
  disabled?: boolean
  /** Both positions at once, so one gesture is one edit. */
  onChange(position: PadPosition): void
}

/** A square for two values at once. Press or drag anywhere; X is across, Y is up. Arrow keys move both axes. */
export const XYPad = ({ label, x, y, valueText, defaultX, defaultY, step = 0.01, disabled, onChange }: XYPadProps) => {
  const ref = useRef<HTMLDivElement>(null)
  const throttle = useThrottledChange(onChange)
  const at = (clientX: number, clientY: number): PadPosition => {
    const box = ref.current?.getBoundingClientRect()
    return box ? padPosition(box, clientX, clientY) : { x, y }
  }
  const drag = useDrag({
    onStart: (event) => onChange(at(event.clientX, event.clientY)),
    onMove: (event) => throttle.push(at(event.clientX, event.clientY)),
    onEnd: throttle.flush,
  })
  const onKeyDown = (event: KeyboardEvent) => {
    const next = padNudge({ x, y }, event.key, step, event.shiftKey)
    if (!next) return
    event.preventDefault()
    onChange(next)
  }

  return (
    <div className={styles.control} data-disabled={disabled || undefined}>
      <div
        ref={ref}
        className={styles.pad}
        role="group"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-roledescription="XY pad"
        aria-description={`${valueText}. Arrow keys move it; left and right change X, up and down change Y.`}
        aria-disabled={disabled || undefined}
        data-x={x.toFixed(4)}
        data-y={y.toFixed(4)}
        {...(disabled ? {} : drag)}
        onKeyDown={disabled ? undefined : onKeyDown}
        onDoubleClick={disabled ? undefined : () => onChange({ x: defaultX, y: defaultY })}
      >
        <div className={styles.padLineX} style={{ left: `${x * 100}%` }} />
        <div className={styles.padLineY} style={{ bottom: `${y * 100}%` }} />
        <div className={styles.padDot} style={{ left: `${x * 100}%`, bottom: `${y * 100}%` }} />
      </div>
      <span className={styles.label}>{label}</span>
      <output className={styles.value}>{valueText}</output>
    </div>
  )
}
