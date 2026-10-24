import type { SampleInfo } from '@core'
import { openClip, openSampleEditor, openTrackView, useProjectStore, useSampleLibrary, useSampleStore } from '@state'
import { WaveformThumb } from '../shared/WaveformThumb'
import styles from './SamplesPanel.module.css'

const describeSample = (sample: SampleInfo): string =>
  `${sample.durationSeconds.toFixed(2)} s · ${sample.channels === 1 ? 'mono' : `${sample.channels} ch`} · .${sample.extension}`

export const SampleRow = ({ sample }: { sample: SampleInfo }) => {
  const library = useSampleLibrary()
  const removeSample = useProjectStore((state) => state.removeSample)
  const addSamplerTrack = useProjectStore((state) => state.addSamplerTrack)
  const addAudioTrack = useProjectStore((state) => state.addAudioTrackFromSample)
  const ready = useSampleStore((state) => state.status[sample.id] === 'ready')

  const makeTrack = () => {
    addSamplerTrack(sample)
    const tracks = useProjectStore.getState().project.tracks
    const added = tracks[tracks.length - 1]
    if (added) openTrackView(added.id, 'instrument')
  }

  /** An audio track that plays the sample as a looping clip, opened for editing. */
  const makeAudioTrack = () => {
    addAudioTrack(sample)
    const tracks = useProjectStore.getState().project.tracks
    const added = tracks[tracks.length - 1]
    if (added?.kind === 'audio') {
      const clip = added.clips[0]
      if (clip) openClip(added.id, clip.id)
    }
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
      <button onClick={() => openSampleEditor(sample.id)} title="Open the sample editor: normalize, reverse, trim and fades" disabled={!ready}>
        ✎
      </button>
      <button onClick={makeTrack} title="Create an instrument track whose sampler plays this sample from MIDI notes">
        New sampler track
      </button>
      <button onClick={makeAudioTrack} title="Create an audio track that plays this sample as a clip, in time with the project">
        New audio track
      </button>
      <button onClick={() => removeSample(sample.id)} aria-label={`Remove ${sample.name}`} title="Remove from the project">
        ×
      </button>
    </li>
  )
}
