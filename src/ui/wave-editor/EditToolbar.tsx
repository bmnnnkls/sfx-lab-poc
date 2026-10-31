import { SAMPLE_EDITS, type SampleEditEntry, type SampleEditKind, type SampleInfo, originOf } from '@core'
import {
  type WaveAudio,
  type WavePane,
  type WaveSelection,
  audioClipboard,
  copyWave,
  cutWave,
  runWaveEdit,
  useClipboard,
  useSampleLibrary,
  useWaveAudioStore,
  useWaveEditSettings,
  useWaveEditorStore,
  waveCopyBlocked,
  waveCutBlocked,
  waveEditBlocked,
  waveEditFacts,
  waveViewKey,
  waveViewOf,
} from '@state'
import { useMemo } from 'react'
import { EditSettings } from './EditSettings'
import styles from './WaveEditor.module.css'

/** The edits the toolbar shows as buttons, after Cut and Copy; the rest are in *Process ▾* and the menus. */
const TOOLBAR_EDITS: readonly SampleEditKind[] = ['replace', 'delete', 'crop']

const entryOf = (kind: SampleEditKind) => SAMPLE_EDITS[kind] as unknown as SampleEditEntry

/**
 * The edits used most, as buttons: *Cut*, *Copy*, *Paste*, *Delete* and *Crop*. A button that can't run is disabled, with
 * a tooltip that says why. Each runs through `state/wave-edits.ts`, as the menus and keys do. Draws the settings popover
 * of the edit asked for (`useWaveEditorStore.ask`), from here or a menu, under the toolbar. Acts on `pane` (the active one).
 */
export const EditToolbar = ({ sample, pane, wave, selection }: { sample: SampleInfo; pane: WavePane; wave: WaveAudio | null; selection: WaveSelection | null }) => {
  const library = useSampleLibrary()
  const clipboard = useClipboard(audioClipboard)
  const busy = useWaveAudioStore((state) => state.editing !== null)
  const key = waveViewKey(pane, originOf(sample))
  const at = useMemo(() => ({ sampleId: sample.id, pane }), [sample.id, pane])
  const asking = useWaveEditorStore((state) => waveViewOf(state.views, key).asking ?? null)
  const lastValues = useWaveEditSettings((state) => (asking ? state.lastValues[asking] : undefined))
  const ask = (kind: SampleEditKind | null) => useWaveEditorStore.getState().ask(key, kind)

  const facts = waveEditFacts(sample, wave, selection, busy, clipboard !== null)
  const button = (title: string, tooltip: string, blocked: string | null, run: () => void) => (
    <button key={title} onClick={run} disabled={blocked !== null} title={blocked ? `${tooltip} (${blocked[0]!.toLowerCase()}${blocked.slice(1)})` : tooltip}>
      {title}
    </button>
  )
  const askingEntry = asking ? entryOf(asking) : undefined

  return (
    <>
      <span className={styles.toolGroup} role="group" aria-label="Edit">
        {button('Cut', 'Copy the selection, then delete it', waveCutBlocked(facts), () => void cutWave(library, at))}
        {button(
          'Copy',
          selection?.band ? 'Copies the whole time range: the clipboard has no band' : 'Copy the selection, with a little of the audio around it for crossfades',
          waveCopyBlocked(facts),
          () => copyWave(at),
        )}
        {TOOLBAR_EDITS.map((kind) => {
          const entry = entryOf(kind)
          return button(entry.title, entry.tooltip, waveEditBlocked(entry, facts), () => void runWaveEdit(library, at, kind))
        })}
      </span>
      {askingEntry && (
        <EditSettings
          key={askingEntry.kind}
          entry={askingEntry}
          values={lastValues ?? {}}
          onCancel={() => ask(null)}
          onApply={(values) => {
            ask(null)
            void runWaveEdit(library, at, askingEntry.kind, { values })
          }}
        />
      )}
    </>
  )
}
