import {
  type FadeCurve,
  type SampleEditContext,
  type SampleEditEntry,
  type SampleEditKind,
  type SampleInfo,
  frameCount,
  originOf,
  revertBlocked,
  sampleEditEntry,
  savedFrameCount,
} from '@core'
import { audioClipboard, copyWaveSelection } from './audio-clipboard'
import { useProjectStore } from './project-store'
import type { SampleLibrary } from './sample-library'
import { type WaveAudio, useWaveAudioStore } from './wave-audio-store'
import { type EditValues, useWaveEditSettings } from './wave-edit-settings'
import { type WaveEditorView, type WaveSelection, useWaveEditorStore, waveViewOf } from './wave-editor-store'
import { type WaveAt, waveViewKey } from './wave-panes'

/**
 * The Wave editor's edits, for the toolbar, the right-click menu, the palette and the keys alike: what an edit is made
 * from, why it can't run now, and running it through `SampleLibrary.editSample`. Nothing else builds an edit.
 */

/** A library sample as a pane of the editor has it: the pane's working copy when that is loaded, and the pane's view. */
export interface OpenWave {
  readonly sample: SampleInfo
  readonly wave: WaveAudio | null
  /** The view's key (the pane and the sample's origin). */
  readonly key: string
  readonly view: WaveEditorView
}

/**
 * A sample of the project as a pane has it, with the pane's working copy if that is the sample's; undefined when the
 * sample is gone. `at` is a subject of the editor or a working copy: both say which sample in which pane.
 */
export const openWave = ({ sampleId, pane }: WaveAt): OpenWave | undefined => {
  const sample = useProjectStore.getState().project.samples.find((candidate) => candidate.id === sampleId)
  if (!sample) return undefined
  const held = useWaveAudioStore.getState().panes[pane]
  const key = waveViewKey(pane, originOf(sample))
  return { sample, wave: held?.sampleId === sampleId ? held : null, key, view: waveViewOf(useWaveEditorStore.getState().views, key) }
}

/** What decides whether an edit can run now. */
export interface WaveEditFacts {
  /** An edit is running. */
  readonly busy: boolean
  /** The working copy is here. */
  readonly loaded: boolean
  readonly selection: WaveSelection | null
  /** Something was copied. */
  readonly clipboard: boolean
  readonly channelCount: number
}

const channelCountOf = (sample: SampleInfo, wave: WaveAudio | null) => wave?.audio.channels.length ?? Math.min(2, sample.channels)

/** The facts for a sample and its selection; `busy` and `clipboard` are read from the stores unless a component passes what it subscribed to. */
export const waveEditFacts = (
  sample: SampleInfo,
  wave: WaveAudio | null,
  selection: WaveSelection | null,
  busy = useWaveAudioStore.getState().editing !== null,
  clipboard = audioClipboard.get() !== null,
): WaveEditFacts => ({ busy, loaded: wave !== null, selection, clipboard, channelCount: channelCountOf(sample, wave) })

/** What an edit is made from: the selection, cursor and clipboard, the audio's shape, and the edit settings. */
export const waveEditContext = ({ sample, wave, view }: Pick<OpenWave, 'sample' | 'wave' | 'view'>, values?: EditValues): SampleEditContext => {
  const settings = useWaveEditSettings.getState()
  return {
    selection: view.selection,
    frames: wave ? frameCount(wave.audio) : savedFrameCount(sample),
    sampleRate: wave?.audio.sampleRate ?? sample.sampleRate,
    channelCount: channelCountOf(sample, wave),
    crossfade: settings.crossfade,
    fadeCurve: settings.fadeCurve,
    settings: values,
    cursor: view.cursor,
    clipboard: audioClipboard.get(),
  }
}

/** Why an edit can't run now, or null. */
export const waveEditBlocked = (entry: SampleEditEntry, facts: WaveEditFacts): string | null => {
  if (facts.busy) return 'An edit is running'
  if (!facts.loaded) return 'The audio is not loaded'
  if (entry.needsSelection && !facts.selection) return 'Select a part first'
  if (entry.needsClipboard && !facts.clipboard) return 'Copy some audio first'
  if (entry.channels === 'both' && facts.channelCount > 1 && facts.selection && facts.selection.channels !== 'both') {
    return `Select both channels to ${entry.title.replace('…', '').toLowerCase()}`
  }
  return null
}

/** Why *Copy* can't run now, or null. Copy isn't an edit: it fills the clipboard, even while an edit runs. */
export const waveCopyBlocked = (facts: WaveEditFacts): string | null =>
  !facts.loaded ? 'The audio is not loaded' : !facts.selection ? 'Select a part first' : null

/** Why *Cut* (Copy, then Delete) can't run now, or null. */
export const waveCutBlocked = (facts: WaveEditFacts): string | null =>
  waveCopyBlocked(facts) ?? waveEditBlocked(sampleEditEntry('delete') as unknown as SampleEditEntry, facts)?.replace('delete', 'cut') ?? null

export interface WaveEditOptions {
  /** Which of the entry's variants (*Fade in*, *Fade out*). */
  readonly variant?: string
  /** The popover's values, remembered as the entry's last ones. */
  readonly values?: EditValues
  /** The fade curve chosen for this fade, remembered as the last used. */
  readonly curve?: FadeCurve
}

/** Runs an edit on a sample open in a pane, unless it can't run now. Resolves when the edit has landed or failed. */
export const runWaveEdit = (library: SampleLibrary, at: WaveAt, kind: SampleEditKind, options: WaveEditOptions = {}): Promise<void> | undefined => {
  const open = openWave(at)
  const entry = sampleEditEntry(kind) as unknown as SampleEditEntry
  if (!open || waveEditBlocked(entry, waveEditFacts(open.sample, open.wave, open.view.selection)) !== null) return undefined
  const settings = useWaveEditSettings.getState()
  if (options.values) settings.setLastValues(kind, options.values)
  if (options.curve) settings.setFadeCurve(options.curve)
  const edit = entry.create(waveEditContext(open, options.values), options.variant)
  return edit ? library.editSample(at.sampleId, edit, { asCopy: useWaveEditSettings.getState().asCopy, pane: at.pane }) : undefined
}

/** *Copy*: the selection to the audio clipboard. Says whether it copied. */
export const copyWave = (at: WaveAt): boolean => {
  const open = openWave(at)
  if (!open?.wave || !open.view.selection) return false
  copyWaveSelection(open.wave, open.view.selection)
  return true
}

/** *Cut*: Copy, then Delete (one undo step), unless the delete can't run. */
export const cutWave = (library: SampleLibrary, at: WaveAt): Promise<void> | undefined => {
  const open = openWave(at)
  if (!open || waveCutBlocked(waveEditFacts(open.sample, open.wave, open.view.selection)) !== null) return undefined
  copyWave(at)
  return runWaveEdit(library, at, 'delete')
}

/** Why *Revert to original* can't run on a sample now, or null. */
export const waveRevertBlocked = (sample: SampleInfo, busy = useWaveAudioStore.getState().editing !== null): string | null =>
  busy ? 'An edit is running' : revertBlocked(sample)

/** *Revert to original*, unless it can't run now. Resolves when it has landed or failed. */
export const revertWave = (library: SampleLibrary, at: WaveAt): Promise<void> | undefined => {
  const open = openWave(at)
  return open && waveRevertBlocked(open.sample) === null ? library.revertSample(at.sampleId, at.pane) : undefined
}
