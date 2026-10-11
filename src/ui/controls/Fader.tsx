import { type KeyboardEvent, useRef } from 'react'
import styles from './controls.module.css'
import { nudge, trackPosition, wheelPosition } from './control-math'
import { useDrag, useThrottledChange, useWheel } from './use-control-input'

interface FaderProps {
  label: string
  /** 0..1. */
  position: number
  valueText: string
  defaultPosition: number
  step?: number
  vertical?: boolean
  disabled?: boolean
  onChange(position: number): void
}

/** A slider: press or drag anywhere on the track to put the thumb there. Same keys, wheel and double-click as the knob. */
export const Fader = ({ label, position, valueText, defaultPosition, step = 0.01, vertical = true, disabled, onChange }: FaderProps) => {
  const ref = useRef<HTMLDivElement>(null)
  const throttle = useThrottledChange(onChange)
  const at = (clientX: number, clientY: number): number => {
    const box = ref.current?.getBoundingClientRect()
    return box ? trackPosition(box, clientX, clientY, vertical) : position
  }
  const drag = useDrag({
    onStart: (event) => {
      // Absolute: the thumb jumps to the pointer, like the native range input it replaces.
      onChange(at(event.clientX, event.clientY))
    },
    onMove: (event) => throttle.push(at(event.clientX, event.clientY)),
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
  const percent = `${position * 100}%`

  return (
    <div className={`${styles.control} ${vertical ? styles.faderVertical : styles.faderHorizontal}`} data-disabled={disabled || undefined}>
      <div
        ref={ref}
        className={styles.fader}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-orientation={vertical ? 'vertical' : 'horizontal'}
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
        <div className={styles.faderGroove} />
        <div className={styles.faderFill} style={vertical ? { height: percent } : { width: percent }} />
        <div className={styles.faderThumb} style={vertical ? { bottom: percent } : { left: percent }} />
      </div>
      <span className={styles.label}>{label}</span>
      <output className={styles.value}>{valueText}</output>
    </div>
  )
}
