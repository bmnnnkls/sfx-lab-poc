import type { EditSetting, SampleEditEntry } from '@core'
import { useState } from 'react'
import styles from './WaveEditor.module.css'

/**
 * The settings of one edit before it runs (*Gain…*, *Normalize…*), built from its registry entry's `settings`: a field
 * each, then *Apply* and *Cancel*. Opens with the values last applied.
 */
export const EditSettings = ({
  entry,
  values,
  onApply,
  onCancel,
}: {
  entry: SampleEditEntry
  values: Readonly<Record<string, number>>
  onApply(values: Record<string, number>): void
  onCancel(): void
}) => {
  const [draft, setDraft] = useState<Record<string, number>>(() =>
    Object.fromEntries(entry.settings.map((setting) => [setting.id, values[setting.id] ?? setting.default])),
  )
  const field = (setting: EditSetting) =>
    setting.kind === 'toggle' ? (
      <label key={setting.id} className={styles.settingToggle}>
        <input type="checkbox" checked={draft[setting.id] !== 0} onChange={(event) => setDraft({ ...draft, [setting.id]: event.target.checked ? 1 : 0 })} />
        {setting.label}
      </label>
    ) : (
      <label key={setting.id} className={styles.settingField}>
        {setting.label}
        <input
          type="number"
          aria-label={setting.label}
          value={draft[setting.id]}
          min={setting.min}
          max={setting.max}
          step={setting.step}
          autoFocus={setting === entry.settings[0]}
          onChange={(event) => setDraft({ ...draft, [setting.id]: event.target.valueAsNumber })}
        />
        {setting.unit && <span>{setting.unit}</span>}
      </label>
    )
  return (
    <form
      className={styles.settings}
      role="dialog"
      aria-label={entry.title.replace('…', '')}
      onSubmit={(event) => {
        event.preventDefault()
        onApply(draft)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel()
      }}
    >
      {entry.settings.map(field)}
      <button type="submit">Apply</button>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </form>
  )
}
