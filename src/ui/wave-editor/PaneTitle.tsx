import { type SampleInfo, frameCount, savedFrameCount } from '@core'
import { type WavePane, useProjectStore, useSelectionStore, useWaveAudioStore, useWavePanesStore } from '@state'
import { Icon } from '../shared/icon'
import { type MenuEntry, PopupMenu } from '../shared/menu'
import { formatTime } from './ruler-ticks'
import styles from './WaveEditor.module.css'

/** A sample rate as the toolbar and title rows show it: "44.1 kHz", "48 kHz". */
export const formatRate = (rate: number) => `${Number((rate / 1000).toFixed(1))} kHz`

/** A sample's length, rate and channels, from its working copy when that is loaded. */
export const SampleFacts = ({ sample, pane }: { sample: SampleInfo; pane: WavePane }) => {
  const wave = useWaveAudioStore((state) => (state.panes[pane]?.sampleId === sample.id ? state.panes[pane] : null))
  const rate = wave?.audio.sampleRate ?? sample.sampleRate
  const channels = wave?.audio.channels.length ?? Math.min(2, sample.channels)
  const length = (wave ? frameCount(wave.audio) : savedFrameCount(sample)) / rate
  return (
    <>
      <span>{formatTime(length)}</span>
      <span>{formatRate(rate)}</span>
      <span>{channels > 1 ? 'stereo' : 'mono'}</span>
    </>
  )
}

/**
 * A pane's title row while the editor is split: its sample's name, a menu of the project's samples to show another
 * (the second pane's starts with its sample following the first's), the sample's facts, and, on the second, ×.
 */
export const PaneTitle = ({ pane, sample }: { pane: WavePane; sample: SampleInfo }) => {
  const following = useWavePanesStore((state) => state.second.sampleId === null)
  const entries = (): MenuEntry[] => {
    const samples = useProjectStore.getState().project.samples
    const pick = (sampleId: string) =>
      pane === 'main' ? useSelectionStore.getState().selectSample(sampleId) : useWavePanesStore.getState().setSecond({ sampleId })
    const list: MenuEntry[] = samples.map((candidate) => ({
      label: candidate.name,
      checked: candidate.id === sample.id && (pane === 'main' || !following),
      onSelect: () => pick(candidate.id),
    }))
    if (pane === 'main') return list
    return [
      { label: 'Same as the first pane', checked: following, tooltip: "Show the first pane's sample, and follow it when it changes", onSelect: () => useWavePanesStore.getState().setSecond({ sampleId: null }) },
      { kind: 'separator' },
      ...list,
    ]
  }
  return (
    <div className={styles.paneTitle} role="group" aria-label={pane === 'main' ? 'First pane' : 'Second pane'}>
      <PopupMenu entries={entries}>
        <button className={styles.paneSample} aria-label={`${pane === 'main' ? 'First' : 'Second'} pane's sample: ${sample.name}`} title="Show another sample in this pane">
          <span className={styles.title}>{sample.name}</span> <Icon name="chevron-down" size={14} />
        </button>
      </PopupMenu>
      <span className={styles.paneFacts}>
        <SampleFacts sample={sample} pane={pane} />
      </span>
      {pane === 'second' && (
        <button className={styles.end} onClick={() => useWavePanesStore.getState().setSecond({ open: false })} aria-label="Close the second pane" title="Close the second pane">
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  )
}
