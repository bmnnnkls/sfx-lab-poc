import { type KeyboardEvent, useRef } from 'react'
import styles from './controls.module.css'
import { KNOB_END, KNOB_START, arcPath, dragPosition, knobPointer, nudge, wheelPosition } from './control-math'
import { useDrag, useThrottledChange, useWheel } from './use-control-input'

interface KnobProps {
  label: string
  /** 0..1. */
  position: number
  /** What the value reads, e.g. "1.2 kHz". */
  valueText: string
  /** Where a double-click puts it. */
  defaultPosition: number
  /** One key press or wheel notch, as a fraction of the range. */
  step?: number
  disabled?: boolean
  onChange(position: number): void
}

const C = 24
const RADIUS = 18

/** A rotary control: drag up or down (Shift for fine), wheel, arrow keys, double-click for the default. */
export const Knob = ({ label, position, valueText, defaultPosition, step = 0.01, disabled, onChange }: KnobProps) => {
  const ref = useRef<HTMLDivElement>(null)
  const throttle = useThrottledChange(onChange)
  const drag = useDrag({
    onStart: (event) => ({ y: event.clientY, position }),
    onMove: (event, start) => throttle.push(dragPosition(start.position, start.y - event.clientY, event.shiftKey)),
    onEnd: throttle.flush,
  })
  useWheel(ref, (event) => {
    if (!disabled) onChange(wheelPosition(position, event.deltaY, step, event.shiftKey))
  })

  const onKeyDown = (event: KeyboardEvent) => {
    const next = nudge(position, event.key, step, event.shiftKey)
    if (next === undefined) return
    event.preventDefault()
    onChange(next)
  }
  const [px, py] = knobPointer(C, C, RADIUS - 4, position)
  const valueFrom = KNOB_START
  const valueTo = KNOB_START + position * (KNOB_END - KNOB_START)

  return (
    <div className={styles.control} data-disabled={disabled || undefined}>
      <div
        ref={ref}
        className={styles.knob}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={Number(position.toFixed(4))}
        aria-valuetext={valueText}
        aria-disabled={disabled || undefined}
        data-position={position.toFixed(4)}
        {...(disabled ? {} : drag)}
        onKeyDown={disabled ? undefined : onKeyDown}
        onDoubleClick={disabled ? undefined : () => onChange(defaultPosition)}
      >
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path className={styles.knobTrack} d={arcPath(C, C, RADIUS, KNOB_START, KNOB_END)} />
          {position > 0 && <path className={styles.knobValue} d={arcPath(C, C, RADIUS, valueFrom, Math.max(valueTo, valueFrom + 0.5))} />}
          <circle className={styles.knobCap} cx={C} cy={C} r={RADIUS - 6} />
          <line className={styles.knobPointer} x1={C} y1={C} x2={px} y2={py} />
        </svg>
      </div>
      <span className={styles.label}>{label}</span>
      <output className={styles.value}>{valueText}</output>
    </div>
  )
}
