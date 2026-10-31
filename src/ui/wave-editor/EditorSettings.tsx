import { CROSSFADE_CURVES, FADE_CURVES, MAX_CROSSFADE_SECONDS, isCrossfadeCurve } from '@core'
import { useWaveEditSettings } from '@state'
import { useEffect, useRef, useState } from 'react'
import styles from './WaveEditor.module.css'

const CROSSFADE_TITLES = Object.fromEntries(FADE_CURVES.map((entry) => [entry.curve, entry.title]))

/**
 * ⚙: the settings set once and rarely changed, in a panel under the toolbar: the crossfade every join and edge ramp
 * takes, and *Edits make copies*. Escape or a press outside closes it.
 */
export const EditorSettings = () => {
  const [open, setOpen] = useState(false)
  const crossfade = useWaveEditSettings((state) => state.crossfade)
  const copies = useWaveEditSettings((state) => state.asCopy)
  const settings = useWaveEditSettings.getState()
  const panel = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onPress = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panel.current?.contains(target) && !button.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPress)
    return () => document.removeEventListener('pointerdown', onPress)
  }, [open])

  return (
    <>
      <button ref={button} aria-label="Editor settings" aria-expanded={open} title="Crossfade and Edits make copies" onClick={() => setOpen(!open)}>
        ⚙
      </button>
      {open && (
        <div
          ref={panel}
          className={`${styles.settings} ${styles.editorSettings}`}
          role="dialog"
          aria-label="Editor settings"
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return
            setOpen(false)
            button.current?.focus()
          }}
        >
          <span className={styles.toolGroup} title="Every join, and the edges of Gain, Silence and Remove DC offset, crossfade over this long">
            <label className={styles.settingField}>
              Crossfade
              <input
                type="number"
                aria-label="Crossfade length"
                autoFocus
                min={0}
                max={MAX_CROSSFADE_SECONDS * 1000}
                step={1}
                value={Math.round(crossfade.seconds * 1000 * 10) / 10}
                onChange={(event) => settings.setCrossfade({ ...crossfade, seconds: event.target.valueAsNumber / 1000 })}
              />
              <span>ms</span>
            </label>
            <select aria-label="Crossfade curve" value={crossfade.curve} onChange={(event) => isCrossfadeCurve(event.target.value) && settings.setCrossfade({ ...crossfade, curve: event.target.value })}>
              {CROSSFADE_CURVES.map((curve) => (
                <option key={curve} value={curve}>
                  {CROSSFADE_TITLES[curve]}
                </option>
              ))}
            </select>
          </span>
          <label
            className={styles.settingToggle}
            title={copies ? 'Each edit adds a new sample and leaves this one as it is' : 'Edits change this sample everywhere it is used; turn on to make a new sample instead'}
          >
            <input type="checkbox" checked={copies} onChange={(event) => settings.setAsCopy(event.target.checked)} />
            Edits make copies
          </label>
        </div>
      )}
    </>
  )
}
