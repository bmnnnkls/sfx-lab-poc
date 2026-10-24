import { useProjectStore, useSampleLibrary, useSelectionStore } from '@state'
import { type DragEvent, useRef, useState } from 'react'
import { SampleEditor } from './SampleEditor'
import { SampleRow } from './SampleRow'
import styles from './SamplesPanel.module.css'

/** The project's sample library: import files (button or drag-and-drop), audition, and build tracks from them. */
export const SamplesPanel = () => {
  const library = useSampleLibrary()
  const samples = useProjectStore((state) => state.project.samples)
  const sampleId = useSelectionStore((state) => state.sampleId)
  const selectSample = useSelectionStore((state) => state.selectSample)
  // The selection outlives this view, so its sample may have been removed (by undo, say) in the meantime.
  const editing = samples.find((sample) => sample.id === sampleId)
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    void library.importFiles(Array.from(event.dataTransfer.files))
  }

  return (
    <div
      className={`${styles.panel} ${dragging ? styles.dragging : ''}`}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <div className={styles.toolbar}>
        <button onClick={() => input.current?.click()}>Import sample…</button>
        <button onClick={() => void library.addDemoSamples()}>Add demo samples</button>
        <button onClick={library.stopPreview}>Stop preview</button>
        <span className={styles.hint}>or drop audio files here (wav, mp3, ogg, flac)</span>
        <input
          ref={input}
          type="file"
          accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a"
          multiple
          hidden
          data-testid="sample-input"
          onChange={(event) => {
            void library.importFiles(Array.from(event.target.files ?? []))
            event.target.value = ''
          }}
        />
      </div>

      {samples.length === 0 ? (
        <p className={styles.empty}>
          No samples yet. Import audio files, or add the demo samples to try the sampler.
        </p>
      ) : editing ? (
        <SampleEditor sample={editing} onClose={() => selectSample(null)} />
      ) : (
        <ul className={styles.list}>
          {samples.map((sample) => (
            <SampleRow key={sample.id} sample={sample} />
          ))}
        </ul>
      )}
    </div>
  )
}
