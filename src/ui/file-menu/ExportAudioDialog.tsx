import { BOUNCE_SAMPLE_RATES, MAX_BOUNCE_BARS, MAX_TAIL_LIMIT, MIN_BOUNCE_BARS } from '@core'
import { useProjectFiles, useProjectStore, useSelectionStore } from '@state'
import { useEffect, useMemo, useRef, useState } from 'react'
import styles from './ExportAudioDialog.module.css'
import { type ExportForm, barsText, initialForm, optionsOf, scopeOf, sceneClipCount, selectedClipChoice } from './export-model'

/**
 * File > Export audio: what to play (the open clip, or a scene), for how many bars, how long a tail, the file's rate and depth. The
 * render is the core's (`Bounce`, run in slices by `ProjectFiles.exportAudio`), so this only collects the choices and shows progress.
 */
export const ExportAudioDialog = ({ onClose }: { onClose: () => void }) => {
  const files = useProjectFiles()
  const project = useProjectStore((state) => state.project)
  const { trackId, clipId } = useSelectionStore()
  const choice = useMemo(() => selectedClipChoice(project, trackId, clipId), [project, trackId, clipId])

  const [form, setForm] = useState<ExportForm>(() => initialForm(choice !== null))
  const [progress, setProgress] = useState<number | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const abort = useRef<AbortController | null>(null)
  const change = (patch: Partial<ExportForm>) => setForm((current) => ({ ...current, ...patch }))

  useEffect(() => {
    const element = dialog.current
    if (element && !element.open) element.showModal()
    return () => abort.current?.abort()
  }, [])

  const scope = scopeOf(form, project, choice)
  const exporting = progress !== null
  const scenes = Array.from({ length: project.sceneCount }, (_, scene) => scene)

  const start = async () => {
    if (!scope || exporting) return
    abort.current = new AbortController()
    setProgress(0)
    const { signal } = abort.current
    await files.exportAudio(optionsOf(form, project, scope), setProgress, signal)
    if (!signal.aborted) onClose()
  }

  /** Cancel stops a render in progress (the dialog stays, so the choices can be changed); otherwise it closes. */
  const cancel = () => {
    if (exporting) {
      abort.current?.abort()
      setProgress(null)
    } else onClose()
  }

  return (
    <dialog ref={dialog} className={styles.dialog} aria-label="Export audio" onCancel={(event) => { event.preventDefault(); cancel() }}>
      <form method="dialog" className={styles.form} onSubmit={(event) => { event.preventDefault(); void start() }}>
        <h2>Export audio (WAV)</h2>

        <fieldset className={styles.group} disabled={exporting}>
          <legend>What to play</legend>
          <label className={styles.choice}>
            <input type="radio" name="scope" checked={form.scope === 'clip'} disabled={choice === null} onChange={() => change({ scope: 'clip', bars: null })} />
            <span>Selected clip{choice ? `: ${choice.label}` : ' (open a clip first)'}</span>
          </label>
          <label className={styles.choice}>
            <input type="radio" name="scope" checked={form.scope === 'scene'} onChange={() => change({ scope: 'scene', bars: null })} />
            <span>Scene</span>
            <select aria-label="Scene" value={form.scene} disabled={form.scope !== 'scene'} onChange={(event) => change({ scene: Number(event.target.value), bars: null })}>
              {scenes.map((scene) => (
                <option key={scene} value={scene}>
                  {scene + 1}
                  {sceneClipCount(project, scene) === 0 ? ' (empty)' : ''}
                </option>
              ))}
            </select>
          </label>
          {scope === null && <p className={styles.hint}>There is nothing to play there.</p>}
        </fieldset>

        <fieldset className={styles.group} disabled={exporting}>
          <legend>Length</legend>
          <label className={styles.row}>
            <span>Bars</span>
            <input
              type="number"
              aria-label="Bars"
              inputMode="decimal"
              min={MIN_BOUNCE_BARS}
              max={MAX_BOUNCE_BARS}
              step={0.25}
              value={barsText(form, project, scope)}
              onChange={(event) => change({ bars: event.target.value })}
            />
          </label>
          <label className={styles.row}>
            <span>Tail (seconds)</span>
            <input type="number" aria-label="Tail (seconds)" inputMode="decimal" min={0} max={MAX_TAIL_LIMIT} step={1} value={form.tail} onChange={(event) => change({ tail: event.target.value })} />
          </label>
          <p className={styles.hint}>The clips loop for the bars, then stop; the tail lets reverbs and delays ring out and ends early once it is quiet.</p>
        </fieldset>

        <fieldset className={styles.group} disabled={exporting}>
          <legend>File</legend>
          <label className={styles.row}>
            <span>Sample rate</span>
            <select aria-label="Sample rate" value={form.sampleRate} onChange={(event) => change({ sampleRate: Number(event.target.value) as ExportForm['sampleRate'] })}>
              {BOUNCE_SAMPLE_RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {rate} Hz
                </option>
              ))}
            </select>
          </label>
          <label className={styles.row}>
            <span>Bit depth</span>
            <select aria-label="Bit depth" value={form.bitDepth} onChange={(event) => change({ bitDepth: Number(event.target.value) as ExportForm['bitDepth'] })}>
              <option value={16}>16-bit PCM</option>
              <option value={32}>32-bit float</option>
            </select>
          </label>
          <label className={styles.choice}>
            <input type="checkbox" aria-label="Normalize to -1 dBFS" checked={form.normalize} onChange={(event) => change({ normalize: event.target.checked })} />
            <span>Normalize to -1 dBFS</span>
          </label>
        </fieldset>

        <p className={styles.progress} role="status" aria-live="polite">
          {exporting ? `Rendering… ${Math.round((progress ?? 0) * 100)} %` : ''}
        </p>
        <div className={styles.buttons}>
          <button type="button" onClick={cancel}>
            {exporting ? 'Stop' : 'Cancel'}
          </button>
          <button type="submit" className={styles.primary} disabled={scope === null || exporting}>
            Export
          </button>
        </div>
      </form>
    </dialog>
  )
}
