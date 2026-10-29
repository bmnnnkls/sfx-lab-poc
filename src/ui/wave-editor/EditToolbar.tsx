import {
  CROSSFADE_CURVES,
  type Crossfade,
  DEFAULT_CROSSFADE,
  FADE_CURVES,
  MAX_CROSSFADE_SECONDS,
  SAMPLE_EDITS,
  type SampleEditContext,
  type SampleEditEntry,
  type SampleEditKind,
  type SampleInfo,
  clampCrossfadeSeconds,
  frameCount,
  isCrossfadeCurve,
  isFadeCurve,
  savedFrameCount,
} from '@core'
import { type WaveAudio, type WaveSelection, audioClipboard, copyWaveSelection, useClipboard, useSampleLibrary, useWaveAudioStore } from '@state'
import { useState } from 'react'
import { useStoredState } from '../shared/use-stored-state'
import { EditSettings } from './EditSettings'
import styles from './WaveEditor.module.css'

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'
const isCrossfade = (value: unknown): value is Crossfade =>
  typeof value === 'object' && value !== null && typeof (value as Crossfade).seconds === 'number' && isCrossfadeCurve((value as Crossfade).curve)
const isSettings = (value: unknown): value is Record<string, Record<string, number>> =>
  typeof value === 'object' && value !== null && Object.values(value).every((entry) => typeof entry === 'object' && entry !== null)

const CROSSFADE_TITLES = Object.fromEntries(FADE_CURVES.map((entry) => [entry.curve, entry.title]))
const ENTRIES = Object.values(SAMPLE_EDITS) as readonly SampleEditEntry[]
const inGroup = (group: SampleEditEntry['group']) => ENTRIES.filter((entry) => entry.group === group)

/**
 * The editor's edits, built from `SAMPLE_EDITS` by group: the structure and clipboard edits, then the processes (with
 * the fade curve beside the fades), the crossfade every join and edge ramp takes, and *Edits make copies*. A button that
 * can't run is disabled, with a tooltip that says why. Each runs through `SampleLibrary.editSample`.
 */
export const EditToolbar = ({
  sample,
  wave,
  selection,
  cursor,
}: {
  sample: SampleInfo
  wave: WaveAudio | null
  selection: WaveSelection | null
  cursor: number
}) => {
  const library = useSampleLibrary()
  const clipboard = useClipboard(audioClipboard)
  const busy = useWaveAudioStore((state) => state.editing !== null)
  const [copies, setCopies] = useStoredState('sfxlab:wave-edit-copies', false, isBoolean)
  const [crossfade, setCrossfade] = useStoredState('sfxlab:wave-crossfade', DEFAULT_CROSSFADE, isCrossfade)
  const [fadeCurve, setFadeCurve] = useStoredState('sfxlab:wave-fade-curve', 'linear', isFadeCurve)
  const [settings, setSettings] = useStoredState('sfxlab:wave-edit-settings', {}, isSettings)
  const [asking, setAsking] = useState<SampleEditKind | null>(null)

  const channelCount = wave?.audio.channels.length ?? Math.min(2, sample.channels)
  const context = (values?: Readonly<Record<string, number>>): SampleEditContext => ({
    selection,
    frames: wave ? frameCount(wave.audio) : savedFrameCount(sample),
    sampleRate: wave?.audio.sampleRate ?? sample.sampleRate,
    channelCount,
    crossfade,
    fadeCurve,
    settings: values,
    cursor,
    clipboard,
  })
  const run = (entry: SampleEditEntry, variant?: string, values?: Readonly<Record<string, number>>) => {
    const edit = entry.create(context(values), variant)
    if (edit) void library.editSample(sample.id, edit, { asCopy: copies })
  }

  /** Why an entry can't run now, or null. */
  const blocked = (entry: SampleEditEntry): string | null => {
    if (busy) return 'An edit is running'
    if (!wave) return 'The audio is not loaded'
    if (entry.needsSelection && !selection) return 'Select a part first'
    if (entry.needsClipboard && !clipboard) return 'Copy some audio first'
    if (entry.channels === 'both' && channelCount > 1 && selection && selection.channels !== 'both') {
      return `Select both channels to ${entry.title.replace('…', '').toLowerCase()}`
    }
    return null
  }

  const buttons = (entry: SampleEditEntry) => {
    const why = blocked(entry)
    const variants = entry.variants ?? [{ id: undefined, title: entry.title, tooltip: entry.tooltip }]
    return variants.map((variant) => (
      <button
        key={`${entry.kind}:${variant.id ?? ''}`}
        onClick={() => (entry.settings.length > 0 ? setAsking(entry.kind) : run(entry, variant.id))}
        disabled={why !== null}
        aria-expanded={entry.settings.length > 0 ? asking === entry.kind : undefined}
        title={why ? `${variant.tooltip} (${why.toLowerCase()})` : variant.tooltip}
      >
        {variant.title}
      </button>
    ))
  }

  const askingEntry = asking ? ENTRIES.find((entry) => entry.kind === asking) : undefined

  // Copy isn't an edit: it fills the clipboard. Cut is Copy, then the delete (one undo step).
  const remove = SAMPLE_EDITS.delete as unknown as SampleEditEntry
  const copyBlocked = !wave ? 'The audio is not loaded' : !selection ? 'Select a part first' : null
  const cutBlocked = copyBlocked ?? blocked(remove)
  const group = (entries: readonly SampleEditEntry[]) =>
    entries.map((entry) => (
      <span key={entry.kind} className={styles.toolGroup}>
        {buttons(entry)}
        {entry.takesFadeCurve && (
          <select aria-label="Fade curve" value={fadeCurve} onChange={(event) => isFadeCurve(event.target.value) && setFadeCurve(event.target.value)} title="The shape of Fade in and Fade out">
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
            onClick={() => {
              if (!wave || !selection) return
              copyWaveSelection(wave, selection)
              run(remove)
            }}
            disabled={cutBlocked !== null}
            title={cutBlocked ? `Copy the selection, then delete it (${cutBlocked.replace('delete', 'cut').toLowerCase()})` : 'Copy the selection, then delete it'}
          >
            Cut
          </button>
          <button
            onClick={() => wave && selection && copyWaveSelection(wave, selection)}
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
              onChange={(event) => setCrossfade({ ...crossfade, seconds: clampCrossfadeSeconds(event.target.valueAsNumber / 1000) })}
            />
            <span>ms</span>
          </label>
          <select aria-label="Crossfade curve" value={crossfade.curve} onChange={(event) => isCrossfadeCurve(event.target.value) && setCrossfade({ ...crossfade, curve: event.target.value })}>
            {CROSSFADE_CURVES.map((curve) => (
              <option key={curve} value={curve}>
                {CROSSFADE_TITLES[curve]}
              </option>
            ))}
          </select>
        </span>
        <button
          aria-pressed={copies}
          onClick={() => setCopies(!copies)}
          title={copies ? 'Each edit adds a new sample and leaves this one as it is' : 'Edits change this sample everywhere it is used; turn on to make a new sample instead'}
        >
          Edits make copies
        </button>
      </div>
      {askingEntry && (
        <EditSettings
          entry={askingEntry}
          values={settings[askingEntry.kind] ?? {}}
          onCancel={() => setAsking(null)}
          onApply={(values) => {
            setAsking(null)
            setSettings({ ...settings, [askingEntry.kind]: values })
            run(askingEntry, undefined, values)
          }}
        />
      )}
    </>
  )
}
