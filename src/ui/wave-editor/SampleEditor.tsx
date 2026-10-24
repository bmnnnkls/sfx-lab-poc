import { type SampleInfo } from '@core'
import {
  deleteSampleRegion,
  fadeIn,
  fadeOut,
  keepSampleRegion,
  normalizeSample,
  reverseSample,
} from '@core'
import { useSampleLibrary, useSampleStore } from '@state'
import { useEffect, useRef, useState } from 'react'
import styles from './WaveEditor.module.css'

const HEIGHT = 150
const MIN_PX_PER_BUCKET = 1
const MAX_PX_PER_BUCKET = 24

/** The zoomable waveform of one library sample, with a draggable selection and one-click edits. */
export const SampleEditor = ({ sample, onClose }: { sample: SampleInfo; onClose(): void }) => {
  const library = useSampleLibrary()
  const peaks = useSampleStore((state) => state.peaks[sample.id])
  const [pxPerBucket, setPxPerBucket] = useState(2)
  const [selection, setSelection] = useState<{ from: number; to: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const drag = useRef<number | null>(null)

  const width = (peaks?.length ?? 0) * pxPerBucket

  useEffect(() => {
    const element = canvas.current
    const context = element?.getContext('2d')
    if (!element || !context || !peaks) return
    context.clearRect(0, 0, width, HEIGHT)
    context.fillStyle = getComputedStyle(element).getPropertyValue('--accent').trim() || '#f5a524'
    for (let x = 0; x < width; x++) {
      const from = Math.floor((x * peaks.length) / width)
      const to = Math.max(from + 1, Math.floor(((x + 1) * peaks.length) / width))
      let peak = 0
      for (let i = from; i < to; i++) peak = Math.max(peak, peaks[i] ?? 0)
      const barHeight = Math.max(1, peak * HEIGHT)
      context.fillRect(x, (HEIGHT - barHeight) / 2, 1, barHeight)
    }
  }, [peaks, width])

  const fractionOf = (event: React.PointerEvent): number => {
    const rect = event.currentTarget.getBoundingClientRect()
    return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
  }

  const apply = (suffix: string, transform: (mono: Float32Array) => Float32Array) => {
    setBusy(true)
    void library.deriveSample(sample.id, suffix, transform).finally(() => setBusy(false))
  }

  const selected = selection !== null && Math.abs(selection.to - selection.from) > 0.001

  return (
    <div className={styles.editor} data-testid="sample-editor">
      <div className={styles.editorToolbar}>
        <strong>{sample.name}</strong>
        <button onClick={() => library.preview(sample.id)} title="Preview">▶</button>
        <button onClick={() => apply('normalized', normalizeSample)} disabled={busy} title="Scale the sample so its loudest point is just under full scale">
          Normalize
        </button>
        <button onClick={() => apply('reversed', reverseSample)} disabled={busy} title="Play the sample backwards">
          Reverse
        </button>
        <button
          onClick={() => selected && apply('cut', (mono) => keepSampleRegion(mono, selection.from, selection.to))}
          disabled={busy || !selected}
          title="Keep only the selected part"
        >
          Keep selection
        </button>
        <button
          onClick={() => selected && apply('edited', (mono) => deleteSampleRegion(mono, selection.from, selection.to))}
          disabled={busy || !selected}
          title="Remove the selected part and join the parts around it"
        >
          Delete selection
        </button>
        <button
          onClick={() => apply('fade in', (mono) => fadeIn(mono, sample.sampleRate, 0.01))}
          disabled={busy}
          title="Fade in over the first 10 ms (removes clicks)"
        >
          Fade in
        </button>
        <button
          onClick={() => apply('fade out', (mono) => fadeOut(mono, sample.sampleRate, 0.01))}
          disabled={busy}
          title="Fade out over the last 10 ms (removes clicks)"
        >
          Fade out
        </button>
        <label className={styles.zoom} title="Zoom">
          <input
            type="range"
            min={MIN_PX_PER_BUCKET}
            max={MAX_PX_PER_BUCKET}
            value={pxPerBucket}
            onChange={(event) => setPxPerBucket(Number(event.target.value))}
          />
        </label>
        <button onClick={onClose} title="Close this sample">Close</button>
      </div>
      <div className={styles.waveformFrame}>
        {peaks ? (
          <div className={styles.waveformScroll} data-scroll="x">
            <div className={styles.waveformBody} style={{ width }}>
              <canvas
                ref={canvas}
                width={width}
                height={HEIGHT}
                className={styles.waveformCanvas}
                onPointerDown={(event) => {
                  drag.current = fractionOf(event)
                  setSelection({ from: drag.current, to: drag.current })
                  event.currentTarget.setPointerCapture(event.pointerId)
                }}
                onPointerMove={(event) => {
                  if (drag.current === null) return
                  setSelection({ from: drag.current, to: fractionOf(event) })
                }}
                onPointerUp={(event) => {
                  drag.current = null
                  event.currentTarget.releasePointerCapture(event.pointerId)
                }}
                onPointerCancel={() => {
                  drag.current = null
                }}
              />
              {selection && (
                <div
                  className={styles.selection}
                  style={{
                    left: Math.min(selection.from, selection.to) * width,
                    width: Math.abs(selection.to - selection.from) * width,
                  }}
                />
              )}
            </div>
          </div>
        ) : (
          <p className={styles.empty}>The waveform appears once the sample has loaded.</p>
        )}
      </div>
      <p className={styles.editorHint}>
        Drag on the waveform to select a part. Edits add a new sample to the library (the original stays untouched), so undo removes
        the copy but never the original.
      </p>
    </div>
  )
}
