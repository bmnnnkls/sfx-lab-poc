import { useEffect, useRef, useState } from 'react'
import type { GrooveSettings } from './groove-settings'
import styles from './ClipEditor.module.css'

interface GroovePanelProps {
  settings: GrooveSettings
  onSettings(settings: GrooveSettings): void
  /** "selection" or "clip": what the tools will act on, shown so there are no surprises. */
  scope: 'selection' | 'clip'
  onQuantize(): void
  onSwing(): void
  onHumanize(): void
}

const percent = (value: number): string => `${Math.round(value * 100)}%`

/**
 * Dropdown with the groove tools. They act on the selected notes, or the whole clip when nothing is
 * selected, using the grid chosen in the toolbar. Each Apply is one undo step.
 */
export const GroovePanel = ({ settings, onSettings, scope, onQuantize, onSwing, onHumanize }: GroovePanelProps) => {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  // Closes on Escape or a click elsewhere in the editor. Clicks outside it (undo/redo, transport) leave it
  // open, because "try a groove, undo, try another" is the natural way to use these tools.
  useEffect(() => {
    if (!open) return
    const editor = root.current?.closest('[data-clip-editor]') ?? document
    const onPointerDown = (event: Event) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    editor.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      editor.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const change = (patch: Partial<GrooveSettings>) => onSettings({ ...settings, ...patch })

  return (
    <div ref={root} className={styles.groove}>
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true">
        Groove ▾
      </button>
      {open && (
        <div className={styles.groovePanel} role="group" aria-label="Groove tools">
          <p className={styles.grooveScope}>
            Acts on the {scope === 'selection' ? 'selected notes' : 'whole clip'}, using the toolbar grid.
          </p>

          <section>
            <h4>Quantize</h4>
            <label>
              <span className={styles.sliderLabel}>Strength <output>{percent(settings.strength)}</output></span>
              <input type="range" min={0} max={100} value={Math.round(settings.strength * 100)} aria-label="Quantize strength"
                onChange={(event) => change({ strength: Number(event.target.value) / 100 })} />
            </label>
            <label className={styles.check}>
              <input type="checkbox" checked={settings.ends} onChange={(event) => change({ ends: event.target.checked })} />
              Snap note ends too
            </label>
            <button onClick={onQuantize}>Quantize</button>
          </section>

          <section>
            <h4>Swing</h4>
            <label>
              <span className={styles.sliderLabel}>Amount <output>{settings.swing}%</output></span>
              <input type="range" min={50} max={75} value={settings.swing} aria-label="Swing amount"
                onChange={(event) => change({ swing: Number(event.target.value) })} />
            </label>
            <p className={styles.grooveNote}>50% straight · 67% triplet · 75% hard shuffle</p>
            <button onClick={onSwing}>Apply swing</button>
          </section>

          <section>
            <h4>Humanize</h4>
            <label>
              <span className={styles.sliderLabel}>Timing <output>{percent(settings.humanizeTiming)}</output></span>
              <input type="range" min={0} max={100} value={Math.round(settings.humanizeTiming * 100)} aria-label="Humanize timing"
                onChange={(event) => change({ humanizeTiming: Number(event.target.value) / 100 })} />
            </label>
            <label>
              <span className={styles.sliderLabel}>Velocity <output>{percent(settings.humanizeVelocity)}</output></span>
              <input type="range" min={0} max={100} value={Math.round(settings.humanizeVelocity * 100)} aria-label="Humanize velocity"
                onChange={(event) => change({ humanizeVelocity: Number(event.target.value) / 100 })} />
            </label>
            <button onClick={onHumanize}>Humanize</button>
          </section>
        </div>
      )}
    </div>
  )
}
