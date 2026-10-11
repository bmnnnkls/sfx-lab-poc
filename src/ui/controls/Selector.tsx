import styles from './controls.module.css'

interface SelectorProps {
  label: string
  options: readonly string[]
  index: number
  disabled?: boolean
  onChange(index: number): void
}

/** Choose one of a few named values: buttons when they fit on a row, a menu when there are many. */
export const Selector = ({ label, options, index, disabled, onChange }: SelectorProps) => (
  <div className={styles.control} data-disabled={disabled || undefined}>
    {options.length <= 5 ? (
      <div className={styles.selector} role="radiogroup" aria-label={label}>
        {options.map((option, optionIndex) => (
          <button
            key={option}
            role="radio"
            aria-checked={optionIndex === index}
            disabled={disabled}
            className={optionIndex === index ? styles.selectorOn : ''}
            onClick={() => onChange(optionIndex)}
          >
            {option}
          </button>
        ))}
      </div>
    ) : (
      <select aria-label={label} value={index} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))}>
        {options.map((option, optionIndex) => (
          <option key={option} value={optionIndex}>
            {option}
          </option>
        ))}
      </select>
    )}
    <span className={styles.label}>{label}</span>
  </div>
)
