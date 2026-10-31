import {
  CROSSFADE_CURVES,
  FADE_CURVES,
  MAX_CROSSFADE_SECONDS,
  SAMPLE_EDITS,
  type SampleEditEntry,
  type SampleInfo,
  isCrossfadeCurve,
  isFadeCurve,
  originOf,
} from '@core'
import {
  type WaveAudio,
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
  waveViewOf,
} from '@state'
import { EditSettings } from './EditSettings'
import styles from './WaveEditor.module.css'

const CROSSFADE_TITLES = Object.fromEntries(FADE_CURVES.map((entry) => [entry.curve, entry.title]))
const ENTRIES = Object.values(SAMPLE_EDITS) as readonly SampleEditEntry[]
const inGroup = (group: SampleEditEntry['group']) => ENTRIES.filter((entry) => entry.group === group)

/**
 * The editor's edits, built from `SAMPLE_EDITS` by group: the structure and clipboard edits, then the processes (with
 * the fade curve beside the fades), the crossfade every join and edge ramp takes, and *Edits make copies*. A button that
 * can't run is disabled, with a tooltip that says why. Each runs through `runWaveEdit` (`state/wave-edits.ts`), as the
 * menus and keys do.
 */
export const EditToolbar = ({
  sample,
  wave,
  selection,
}: {
  sample: SampleInfo
  wave: WaveAudio | null
  selection: WaveSelection | null
}) => {
  const library = useSampleLibrary()
  const clipboard = useClipboard(audioClipboard)
  const busy = useWaveAudioStore((state) => state.editing !== null)
  const copies = useWaveEditSettings((state) => state.asCopy)
  const crossfade = useWaveEditSettings((state) => state.crossfade)
  const fadeCurve = useWaveEditSettings((state) => state.fadeCurve)
  const lastValues = useWaveEditSettings((state) => state.lastValues)
  const key = originOf(sample)
  const asking = useWaveEditorStore((state) => waveViewOf(state.views, key).asking ?? null)
  const settings = useWaveEditSettings.getState()
  const ask = (kind: SampleEditEntry['kind'] | null) => useWaveEditorStore.getState().ask(key, kind)

  const facts = waveEditFacts(sample, wave, selection, busy, clipboard !== null)
  const blocked = (entry: SampleEditEntry) => waveEditBlocked(entry, facts)
  const run = (entry: SampleEditEntry, variant?: string) => void runWaveEdit(library, sample.id, entry.kind, { variant })

  const buttons = (entry: SampleEditEntry) => {
    const why = blocked(entry)
    const variants = entry.variants ?? [{ id: undefined, title: entry.title, tooltip: entry.tooltip }]
    return variants.map((variant) => (
      <button
        key={`${entry.kind}:${variant.id ?? ''}`}
        onClick={() => (entry.settings.length > 0 ? ask(entry.kind) : run(entry, variant.id))}
        disabled={why !== null}
        aria-expanded={entry.settings.length > 0 ? asking === entry.kind : undefined}
        title={why ? `${variant.tooltip} (${why.toLowerCase()})` : variant.tooltip}
      >
        {variant.title}
      </button>
    ))
  }

  const askingEntry = asking ? ENTRIES.find((entry) => entry.kind === asking) : undefined

  const copyBlocked = waveCopyBlocked(facts)
  const cutBlocked = waveCutBlocked(facts)
  const group = (entries: readonly SampleEditEntry[]) =>
    entries.map((entry) => (
      <span key={entry.kind} className={styles.toolGroup}>
        {buttons(entry)}
        {entry.takesFadeCurve && (
          <select aria-label="Fade curve" value={fadeCurve} onChange={(event) => isFadeCurve(event.target.value) && settings.setFadeCurve(event.target.value)} title="The shape of Fade in and Fade out">
            {FADE_CURVES.map((curve) => (
              <option key={curve.curve} value={curve.curve}>
                {curve.title}
              </option>
            ))}
          </select>
        )}
      </span>
    ))

  return (
    <>
      {/* One line of its own, under the editor's buttons; it scrolls sideways where it doesn't fit. */}
      <div className={styles.editRow} data-scroll>
        <span className={styles.toolGroup} role="group" aria-label="Edit">
          <button
            onClick={() => void cutWave(library, sample.id)}
            disabled={cutBlocked !== null}
            title={cutBlocked ? `Copy the selection, then delete it (${cutBlocked.toLowerCase()})` : 'Copy the selection, then delete it'}
          >
            Cut
          </button>
          <button
            onClick={() => copyWave(sample.id)}
            disabled={copyBlocked !== null}
            title={copyBlocked ? `Copy the selection (${copyBlocked.toLowerCase()})` : 'Copy the selection, with a little of the audio around it for crossfades'}
          >
            Copy
          </button>
          {group(inGroup('clipboard'))}
          {group(inGroup('structure'))}
        </span>
        <span className={styles.toolGroup} role="group" aria-label="Process">
          {group(inGroup('process'))}
        </span>
        <span className={styles.toolGroup} role="group" aria-label="Crossfade" title="Every join, and the edges of Gain, Silence and Remove DC offset, crossfade over this long">
          <label className={styles.settingField}>
            Crossfade
            <input
              type="number"
              aria-label="Crossfade length"
              min={0}
              max={MAX_CROSSFADE_SECONDS * 1000}
              step={1}
              value={Math.round(crossfade.seconds * 1000 * 10) / 10}
              onChange={(event) => settings.setCrossfade({ ...crossfade, seconds: event.target.valueAsNumber / 1000 })}
            />
            <span>ms</span>
          </label>
          <select aria-label="Crossfade curve" value={crossfade.curve} onChange={(event) => isCrossfadeCurve(event.target.value) && settings.setCrossfade({ ...crossfade, curve: event.target.value })}>
            {CROSSFADE_CURVES.map((curve) => (
              <option key={curve} value={curve}>
                {CROSSFADE_TITLES[curve]}
              </option>
            ))}
          </select>
        </span>
        <button
          aria-pressed={copies}
          onClick={() => settings.setAsCopy(!copies)}
          title={copies ? 'Each edit adds a new sample and leaves this one as it is' : 'Edits change this sample everywhere it is used; turn on to make a new sample instead'}
        >
          Edits make copies
        </button>
      </div>
      {askingEntry && (
        <EditSettings
          entry={askingEntry}
          values={lastValues[askingEntry.kind] ?? {}}
          onCancel={() => ask(null)}
          onApply={(values) => {
            ask(null)
            void runWaveEdit(library, sample.id, askingEntry.kind, { values })
          }}
        />
      )}
    </>
  )
}
