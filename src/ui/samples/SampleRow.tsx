import type { SampleInfo } from '@core'
import { type Subject, runAction, useSampleStore } from '@state'
import { ActionMenu, useActionContext } from '../shared/menu'
import { InPlaceRename } from '../shared/RenameField'
import { WaveformThumb } from '../shared/WaveformThumb'
import styles from './SamplesPanel.module.css'

const describeSample = (sample: SampleInfo): string =>
  `${sample.durationSeconds.toFixed(2)} s · ${sample.channels === 1 ? 'mono' : `${sample.channels} ch`} · .${sample.extension}`

export const SampleRow = ({ sample }: { sample: SampleInfo }) => {
  const context = useActionContext()
  const subject: Subject = { kind: 'sample', sampleId: sample.id }
  const run = (id: string) => () => runAction(id, subject, context)
  const ready = useSampleStore((state) => state.status[sample.id] === 'ready')

  return (
    <ActionMenu subject={subject}>
    <li className={styles.row}>
      <WaveformThumb sampleId={sample.id} />
      <div className={styles.meta}>
        <InPlaceRename subject={subject} name={sample.name} label={`Name of ${sample.name}`}>
          <strong>{sample.name}</strong>
        </InPlaceRename>
        <span>{describeSample(sample)}</span>
      </div>
      <button onClick={run('sample.preview')} disabled={!ready} title="Preview" aria-label={`Preview ${sample.name}`}>
        ▶
      </button>
      <button onClick={run('sample.open')} title="Open in the wave editor: normalize, reverse, trim and fades" disabled={!ready}>
        ✎
      </button>
      <button onClick={run('sample.new-sampler-track')} title="Create an instrument track whose sampler plays this sample from MIDI notes">
        New sampler track
      </button>
      <button onClick={run('sample.new-audio-track')} title="Create an audio track that plays this sample as a clip, in time with the project">
        New audio track
      </button>
      <button onClick={run('sample.remove')} aria-label={`Remove ${sample.name}`} title="Remove from the project">
        ×
      </button>
    </li>
    </ActionMenu>
  )
}
