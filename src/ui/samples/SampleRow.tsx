import type { SampleInfo } from '@core'
import { type SubjectOf, runAction, useSampleStore } from '@state'
import { useDragSource } from '../shared/drag'
import { Icon } from '../shared/icon'
import { ActionMenu, useActionContext } from '../shared/menu'
import { InPlaceRename, useRenaming } from '../shared/RenameField'
import { WaveformThumb } from '../shared/WaveformThumb'
import styles from './SamplesPanel.module.css'

const describeSample = (sample: SampleInfo): string =>
  `${sample.durationSeconds.toFixed(2)} s · ${sample.channels === 1 ? 'mono' : `${sample.channels} ch`} · .${sample.extension}`

export const SampleRow = ({ sample }: { sample: SampleInfo }) => {
  const context = useActionContext()
  const subject: SubjectOf<'sample'> = { kind: 'sample', sampleId: sample.id }
  const run = (id: string) => () => runAction(id, subject, context)
  const ready = useSampleStore((state) => state.status[sample.id] === 'ready')
  // It drags onto an empty audio slot, an audio lane or an instrument's canvas.
  const drag = useDragSource(useRenaming(subject) ? null : subject)

  return (
    <ActionMenu subject={subject}>
    <li className={styles.row} {...drag}>
      <WaveformThumb sampleId={sample.id} />
      <div className={styles.meta}>
        <InPlaceRename subject={subject} name={sample.name} label={`Name of ${sample.name}`}>
          <strong>{sample.name}</strong>
        </InPlaceRename>
        <span>{describeSample(sample)}</span>
      </div>
      <button onClick={run('sample.preview')} disabled={!ready} title="Preview" aria-label={`Preview ${sample.name}`}>
        <Icon name="play" filled size={14} />
      </button>
      <button onClick={run('sample.open')} title="Open in the wave editor: normalize, reverse, trim and fades" aria-label={`Edit ${sample.name}`} disabled={!ready}>
        <Icon name="edit" size={14} />
      </button>
      <button onClick={run('sample.new-sampler-track')} title="Create an instrument track whose sampler plays this sample from MIDI notes">
        New sampler track
      </button>
      <button onClick={run('sample.new-audio-track')} title="Create an audio track that plays this sample as a clip, in time with the project">
        New audio track
      </button>
      <button onClick={run('sample.remove')} aria-label={`Remove ${sample.name}`} title="Remove from the project">
        <Icon name="close" size={14} />
      </button>
    </li>
    </ActionMenu>
  )
}
