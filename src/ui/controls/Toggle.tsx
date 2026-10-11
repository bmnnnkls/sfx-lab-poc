import styles from './controls.module.css'

interface ToggleProps {
  label: string
  on: boolean
  /** A momentary switch is on only while it is held; a toggle stays where it is put. */
  momentary?: boolean
  disabled?: boolean
  onChange(on: boolean): void
}

/** An on/off switch: click to toggle, or, momentary, press and hold (Space and Enter work the same way). */
export const Toggle = ({ label, on, momentary = false, disabled, onChange }: ToggleProps) => (
  <div className={styles.control} data-disabled={disabled || undefined}>
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      data-on={on}
      data-momentary={momentary || undefined}
      className={`${styles.toggle} ${on ? styles.toggleOn : ''}`}
      onClick={momentary ? undefined : () => onChange(!on)}
      onPointerDown={momentary ? () => onChange(true) : undefined}
      onPointerUp={momentary ? () => onChange(false) : undefined}
      onPointerCancel={momentary ? () => onChange(false) : undefined}
      onPointerLeave={momentary && on ? () => onChange(false) : undefined}
      onKeyDown={momentary ? (event) => (event.key === ' ' || event.key === 'Enter') && !event.repeat && onChange(true) : undefined}
      onKeyUp={momentary ? (event) => (event.key === ' ' || event.key === 'Enter') && onChange(false) : undefined}
    >
      {on ? 'On' : 'Off'}
    </button>
    <span className={styles.label}>{label}</span>
  </div>
)
