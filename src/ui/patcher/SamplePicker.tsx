import { useProjectStore } from '@state'
import { WaveformThumb } from '../shared/WaveformThumb'
import { SAMPLE_PICKER_HEIGHT } from './geometry'
import styles from './Patcher.module.css'

interface SamplePickerProps {
  sampleId: string | undefined
  onChange(sampleId: string | null): void
}

/** Chooses which library sample a sampler node plays, and shows its waveform. */
export const SamplePicker = ({ sampleId, onChange }: SamplePickerProps) => {
  const samples = useProjectStore((state) => state.project.samples)

  return (
    <div className={styles.samplePicker} style={{ height: SAMPLE_PICKER_HEIGHT }}>
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
      {sampleId ? <WaveformThumb sampleId={sampleId} width={152} height={26} /> : <div style={{ height: 26 }} />}
    </div>
  )
}
