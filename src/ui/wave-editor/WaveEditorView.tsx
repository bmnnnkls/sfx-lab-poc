import { openSampleEditor, useLayoutStore, useProjectStore, useSampleLibrary, useSelectionStore } from '@state'
import { useRef } from 'react'
import { SampleEditor } from './SampleEditor'
import styles from './WaveEditor.module.css'

/** How many of the project's samples the empty state offers before it points to the full list. */
const MAX_CHOICES = 8

/**
 * The wave editor: the open sample's overview, ruler and lanes, and its edits. ✎ on a sample opens it here
 * (`openSampleEditor`); *Close* clears the selection.
 */
export const WaveEditorView = () => {
  const samples = useProjectStore((state) => state.project.samples)
  const sampleId = useSelectionStore((state) => state.sampleId)
  const selectSample = useSelectionStore((state) => state.selectSample)
  // The selection outlives the sample, which may have been removed (by undo, say) in the meantime.
  const editing = samples.find((sample) => sample.id === sampleId)
  return editing ? <SampleEditor sample={editing} onClose={() => selectSample(null)} /> : <NoSample />
}

/** What to open: the project's first samples, the full list when there are more, and an import. */
const NoSample = () => {
  const library = useSampleLibrary()
  const samples = useProjectStore((state) => state.project.samples)
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className={styles.empty}>
      <p>No sample is open.</p>
      {samples.length > 0 && (
        <div className={styles.choices}>
          {samples.slice(0, MAX_CHOICES).map((sample) => (
            <button key={sample.id} onClick={() => openSampleEditor(sample.id)} title={`Open ${sample.name}`}>
              {sample.name}
            </button>
          ))}
          {samples.length > MAX_CHOICES && <button onClick={() => useLayoutStore.getState().revealView('samples')}>Show samples</button>}
        </div>
      )}
      <div className={styles.choices}>
        <button onClick={() => input.current?.click()}>Import samples…</button>
      </div>
      <input
        ref={input}
        type="file"
        accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a"
        multiple
        hidden
        data-testid="wave-sample-input"
        onChange={(event) => {
          void library.importFiles(Array.from(event.target.files ?? []))
          event.target.value = ''
        }}
      />
    </div>
  )
}
