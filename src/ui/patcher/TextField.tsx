import { useState } from 'react'

interface TextFieldProps {
  value: string
  label: string
  placeholder?: string
  maxLength?: number
  onCommit(text: string): void
  className?: string
}

/**
 * A text field that applies on Enter or when it is left, never per keystroke: the edit trims, so typing "Lead " would
 * lose its space as it was typed. Escape puts back what was there.
 */
export const TextField = ({ value, label, placeholder, maxLength, onCommit, className }: TextFieldProps) => {
  const [draft, setDraft] = useState<string | null>(null)
  const finish = () => {
    if (draft !== null && draft !== value) onCommit(draft)
    setDraft(null)
  }
  return (
    <input
      type="text"
      className={className}
      aria-label={label}
      placeholder={placeholder}
      maxLength={maxLength}
      value={draft ?? value}
      spellCheck={false}
      autoComplete="off"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={finish}
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
