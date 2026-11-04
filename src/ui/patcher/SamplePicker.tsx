import { openSampleEditor, useProjectStore } from '@state'
import { WaveformThumb } from '../shared/WaveformThumb'
import styles from './Patcher.module.css'

interface SamplePickerProps {
  sampleId: string | undefined
  onChange(sampleId: string | null): void
}

/** Chooses which library sample a sampler node plays, shows its waveform, and opens it in the Wave editor. */
export const SamplePicker = ({ sampleId, onChange }: SamplePickerProps) => {
  const samples = useProjectStore((state) => state.project.samples)

  return (
    <div className={styles.samplePicker}>
      <select
        value={sampleId ?? ''}
        aria-label="Sample"
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value="">{samples.length === 0 ? '(import a sample first)' : '(no sample)'}</option>
        {samples.map((sample) => (
          <option key={sample.id} value={sample.id}>
            {sample.name}
          </option>
        ))}
      </select>
      <button
        onClick={() => sampleId && openSampleEditor(sampleId)}
        disabled={!sampleId || !samples.some((sample) => sample.id === sampleId)}
        title={sampleId ? 'Open this sample in the Wave editor' : 'Pick a sample first'}
      >
        Edit
      </button>
      {sampleId ? <WaveformThumb sampleId={sampleId} width={200} height={26} /> : <div style={{ height: 26 }} />}
    </div>
  )
}
