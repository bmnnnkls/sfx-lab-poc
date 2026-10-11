import type { SampleInfo } from '@core'
import { useProjectStore, useSampleLibrary, useSampleStore, useSelectionStore } from '@state'
import { WaveformThumb } from '../shared/WaveformThumb'
import styles from './SamplesPanel.module.css'

const describeSample = (sample: SampleInfo): string =>
  `${sample.durationSeconds.toFixed(2)} s · ${sample.channels === 1 ? 'mono' : `${sample.channels} ch`} · .${sample.extension}`

export const SampleRow = ({ sample }: { sample: SampleInfo }) => {
  const library = useSampleLibrary()
  const removeSample = useProjectStore((state) => state.removeSample)
  const addSamplerTrack = useProjectStore((state) => state.addSamplerTrack)
  const selectTrack = useSelectionStore((state) => state.selectTrack)
  const setTab = useSelectionStore((state) => state.setTab)
  const ready = useSampleStore((state) => state.status[sample.id] === 'ready')

  const makeTrack = () => {
    addSamplerTrack(sample)
    const tracks = useProjectStore.getState().project.tracks
    const added = tracks[tracks.length - 1]
    if (added) selectTrack(added.id)
    setTab('device')
  }

  return (
    <li className={styles.row}>
      <WaveformThumb sampleId={sample.id} />
      <div className={styles.meta}>
        <strong>{sample.name}</strong>
        <span>{describeSample(sample)}</span>
      </div>
      <button onClick={() => library.preview(sample.id)} disabled={!ready} title="Preview" aria-label={`Preview ${sample.name}`}>
        ▶
      </button>
      <button onClick={makeTrack} title="Create a track that plays this sample">
        New sampler track
      </button>
      <button onClick={() => removeSample(sample.id)} aria-label={`Remove ${sample.name}`} title="Remove from the project">
        ×
      </button>
    </li>
  )
}
