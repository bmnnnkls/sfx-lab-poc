import { useState } from 'react'
import { parseNumber } from './property-rows'

interface NumberFieldProps {
  value: number
  label: string
  disabled?: boolean
  /** Called with every value the text parses to, as it is typed. */
  onChange(value: number): void
  className?: string
}

/** What a stored number looks like in a field: six significant digits, no trailing zeros. */
const written = (value: number): string => String(Number(value.toPrecision(6)))

/**
 * A text field for a number. Half-typed text ("-", "0.") is kept as typed and not committed; every complete number is,
 * as it is typed, so the sound follows. Leaving the field (or Escape) puts back the stored value in its plain form.
 */
export const NumberField = ({ value, label, disabled, onChange, className }: NumberFieldProps) => {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      type="text"
      inputMode="decimal"
      className={className}
      aria-label={label}
      disabled={disabled}
      value={draft ?? written(value)}
      spellCheck={false}
      autoComplete="off"
      onChange={(event) => {
        setDraft(event.target.value)
        const parsed = parseNumber(event.target.value)
        if (parsed !== undefined) onChange(parsed)
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        else if (event.key === 'Escape') {
          setDraft(null)
          event.currentTarget.blur()
        }
        event.stopPropagation()
      }}
    />
  )
}
