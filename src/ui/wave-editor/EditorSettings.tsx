import { CROSSFADE_CURVES, FADE_CURVES, MAX_CROSSFADE_SECONDS, SPECTRUM_FFT_SIZES, isCrossfadeCurve, isSpectrumFftSize } from '@core'
import { SPECTRUM_FLOOR_RANGE_DB, useWaveEditSettings } from '@state'
import { useEffect, useRef, useState } from 'react'
import styles from './WaveEditor.module.css'

const CROSSFADE_TITLES = Object.fromEntries(FADE_CURVES.map((entry) => [entry.curve, entry.title]))

/**
 * ⚙: the settings set once and rarely changed, in a panel under the toolbar: the crossfade every join and edge ramp
 * takes, *Edits make copies*, and the spectrogram's frequency scale, FFT size and floor. Escape or a press outside
 * closes it.
 */
export const EditorSettings = () => {
  const [open, setOpen] = useState(false)
  const crossfade = useWaveEditSettings((state) => state.crossfade)
  const copies = useWaveEditSettings((state) => state.asCopy)
  const spectrum = useWaveEditSettings((state) => state.spectrum)
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
      <button ref={button} aria-label="Editor settings" aria-expanded={open} title="Crossfade, Edits make copies, and the spectrogram" onClick={() => setOpen(!open)}>
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
          <span className={styles.toolGroup} role="group" aria-label="Spectrogram">
            <span>Spectrogram</span>
            <label className={styles.settingToggle} title="Octaves take the same height: the low end has room">
              <input type="radio" name="spectrum-scale" checked={spectrum.scale === 'log'} onChange={() => settings.setSpectrum({ scale: 'log' })} />
              Log
            </label>
            <label className={styles.settingToggle} title="Every kHz takes the same height">
              <input type="radio" name="spectrum-scale" checked={spectrum.scale === 'linear'} onChange={() => settings.setSpectrum({ scale: 'linear' })} />
              Linear
            </label>
            <select
              aria-label="FFT size"
              title="Larger sizes separate frequencies better and times worse; a new size computes the spectrogram again"
              value={spectrum.fftSize}
              onChange={(event) => {
                const size = Number(event.target.value)
                if (isSpectrumFftSize(size)) settings.setSpectrum({ fftSize: size })
              }}
            >
              {SPECTRUM_FFT_SIZES.map((size) => (
                <option key={size} value={size}>
                  FFT {size}
                </option>
              ))}
            </select>
            <label className={styles.settingField} title="Quieter than this is drawn as the background">
              Floor
              <input
                type="number"
                aria-label="Spectrogram floor"
                min={SPECTRUM_FLOOR_RANGE_DB.min}
                max={SPECTRUM_FLOOR_RANGE_DB.max}
                step={5}
                value={spectrum.floorDb}
                onChange={(event) => Number.isFinite(event.target.valueAsNumber) && settings.setSpectrum({ floorDb: event.target.valueAsNumber })}
              />
              <span>dB</span>
            </label>
          </span>
        </div>
      )}
    </>
  )
}
