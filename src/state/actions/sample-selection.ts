import { FADE_CURVES, SAMPLE_EDITS, type SampleEditEntry, type SampleEditKind, isFadeCurve } from '@core'
import { useSampleStore } from '../sample-store'
import { useWaveEditSettings } from '../wave-edit-settings'
import {
  copyWave,
  cutWave,
  openWave,
  revertWave,
  runWaveEdit,
  waveCopyBlocked,
  waveCutBlocked,
  type WaveEditFacts,
  waveEditBlocked,
  waveEditFacts,
  waveRevertBlocked,
} from '../wave-edits'
import { useWaveEditorStore } from '../wave-editor-store'
import { type WaveMarkKind, addWaveMarker, makeWaveRegion, markerAtCursor, setWaveLoop, waveMarkBlocked } from '../wave-marks'
import { isWavePreviewing, selectAllWave, toggleWavePreview } from '../wave-view'
import { startRename } from './rename'
import type { Action, ActionChoice, SubjectOf } from './types'

type SelectionSubject = SubjectOf<'sample-selection'>

const entryOf = (kind: SampleEditKind) => SAMPLE_EDITS[kind] as unknown as SampleEditEntry

const inProject = (subject: SelectionSubject) => openWave(subject) !== undefined
/** Why an entry can't run on the subject's sample now, from the same facts the toolbar reads. */
const blockedBy = (check: (facts: WaveEditFacts) => string | null) => (subject: SelectionSubject): string | null => {
  const open = openWave(subject)
  return open ? check(waveEditFacts(open.sample, open.wave, open.view.selection)) : 'The sample is gone'
}
const editBlocked = (kind: SampleEditKind) => blockedBy((facts) => waveEditBlocked(entryOf(kind), facts))
/** The tooltip of an entry that may be blocked: why it can't run, else what it does. */
const why = (blocked: (subject: SelectionSubject) => string | null, tooltip: string) => (subject: SelectionSubject) => blocked(subject) ?? tooltip

/** One edit of the registry as an action: it runs at once, or opens its settings popover under the toolbar. */
const editAction = (kind: SampleEditKind, variant?: { id: string; title: string; tooltip: string }): Action<SelectionSubject> => {
  const entry = entryOf(kind)
  const blocked = editBlocked(kind)
  return {
    id: `sample-selection.${variant ? `${kind}-${variant.id}` : kind}`,
    title: variant?.title ?? entry.title,
    group: 'process',
    // Its popover's first field takes the focus.
    ...(entry.settings.length > 0 && { takesFocus: true }),
    tooltip: why(blocked, variant?.tooltip ?? entry.tooltip),
    enabled: (subject) => blocked(subject) === null,
    run: (subject, { samples }) => {
      const open = openWave(subject)
      if (!open) return
      if (entry.settings.length > 0) return useWaveEditorStore.getState().ask(open.key, kind)
      return runWaveEdit(samples, subject, kind, { variant: variant?.id })
    },
  }
}

/** A fade, with its curve chosen each time: the last used first, checked. */
const fadeAction = (variant: { id: string; title: string; tooltip: string }): Action<SelectionSubject> => ({
  ...editAction('fade', variant),
  choices: (): readonly ActionChoice[] => {
    const last = useWaveEditSettings.getState().fadeCurve
    const curves = [...FADE_CURVES].sort((a, b) => Number(b.curve === last) - Number(a.curve === last))
    return curves.map((curve) => ({ id: curve.curve, title: curve.title, checked: curve.curve === last }))
  },
  run: (subject, { samples }, choice) =>
    runWaveEdit(samples, subject, 'fade', { variant: variant.id, ...(isFadeCurve(choice) && { curve: choice }) }),
})

/**
 * The processes, built from the registry: each `process` entry of `SAMPLE_EDITS` (a fade once per variant), then
 * *Insert silence…*. A new process is an action, the toolbar's *Process ▾* entry and a palette row with no other change.
 */
export const processActions = (): readonly Action<SelectionSubject>[] => [
  ...(Object.values(SAMPLE_EDITS) as readonly SampleEditEntry[])
    .filter((entry) => entry.group === 'process')
    .flatMap((entry) => (entry.variants ? entry.variants.map((variant) => (entry.takesFadeCurve ? fadeAction(variant) : editAction(entry.kind, variant))) : [editAction(entry.kind)])),
  editAction('insert'),
]

/** A structure or clipboard edit, run at once. */
const structureAction = (kind: SampleEditKind, verb: Action['verb']): Action<SelectionSubject> => ({
  ...editAction(kind),
  group: 'clipboard',
  ...(verb && { verb }),
})

const ready = ({ sampleId }: SelectionSubject) => useSampleStore.getState().status[sampleId] === 'ready'
const hasSelection = (subject: SelectionSubject) => !!openWave(subject)?.view.selection
const loaded = (subject: SelectionSubject) => !!openWave(subject)?.wave

const cutBlocked = blockedBy(waveCutBlocked)
const revertReason = (subject: SelectionSubject): string | null => {
  const open = openWave(subject)
  return open ? waveRevertBlocked(open.sample) : 'The sample is gone'
}
const copyBlocked = blockedBy(waveCopyBlocked)

/** *Add marker*, *Make region* or *Set loop*: disabled, with the reason, when it can't be added now. */
const markAction = (kind: WaveMarkKind, title: string, tooltip: string, run: (subject: SelectionSubject) => void): Action<SelectionSubject> => {
  const blocked = (subject: SelectionSubject) => waveMarkBlocked(subject, kind)
  return {
    id: `sample-selection.${kind === 'marker' ? 'add-marker' : kind === 'region' ? 'make-region' : 'set-loop'}`,
    title,
    group: 'marks',
    tooltip: why(blocked, tooltip),
    enabled: (subject) => blocked(subject) === null,
    run: (subject) => run(subject),
  }
}

const actions: readonly Action<SelectionSubject>[] = [
  {
    id: 'sample-selection.cut',
    verb: 'cut',
    title: 'Cut',
    group: 'clipboard',
    tooltip: why(cutBlocked, 'Copy the selection, then delete it'),
    enabled: (subject) => cutBlocked(subject) === null,
    run: (subject, { samples }) => cutWave(samples, subject),
  },
  {
    id: 'sample-selection.copy',
    verb: 'copy',
    title: 'Copy',
    group: 'clipboard',
    tooltip: why(copyBlocked, 'Copy the selection, with a little of the audio around it for crossfades'),
    enabled: (subject) => copyBlocked(subject) === null,
    run: (subject) => void copyWave(subject),
  },
  { ...structureAction('replace', 'paste'), id: 'sample-selection.paste' },
  structureAction('delete', 'delete'),
  structureAction('crop', undefined),
  ...processActions(),
  {
    id: 'sample-selection.revert',
    title: 'Revert to original',
    group: 'process',
    separated: true,
    tooltip: (subject) => revertReason(subject) ?? "Point every use back at the sample's first version; clips, markers, regions and the loop go back where they were",
    enabled: (subject) => revertReason(subject) === null,
    run: (subject, { samples }) => revertWave(samples, subject),
  },
  markAction('marker', 'Add marker', 'Put a marker at the cursor', (subject) => void addWaveMarker(subject)),
  markAction('region', 'Make region', 'Save the selection as a named region', (subject) => void makeWaveRegion(subject)),
  markAction('loop', 'Set loop', "Make the selection the sample's loop, which a sampler in loop mode repeats", (subject) => setWaveLoop(subject)),
  {
    // F2 with the lanes focused renames the marker the cursor is on: the one *Add marker* (M) just put there.
    id: 'sample-selection.rename-marker',
    verb: 'rename',
    title: 'Rename marker',
    group: 'marks',
    takesFocus: true,
    applies: (subject) => markerAtCursor(subject) !== undefined,
    run: (subject, context) => {
      const marker = markerAtCursor(subject)
      if (marker) startRename({ kind: 'sample-marker', sampleId: subject.sampleId, pane: subject.pane, markerId: marker.id }, context)
    },
  },
  {
    id: 'sample-selection.select-all',
    title: 'Select all',
    group: 'view',
    enabled: loaded,
    run: (subject) => selectAllWave(subject),
  },
  {
    id: 'sample-selection.zoom-selection',
    title: 'Zoom to selection',
    group: 'view',
    enabled: (subject) => loaded(subject) && hasSelection(subject),
    run: (subject) => {
      const open = openWave(subject)
      const selection = open?.view.selection
      if (open && selection) useWaveEditorStore.getState().zoom(open.key, { from: selection.from, to: selection.to })
    },
  },
  {
    id: 'sample-selection.zoom-fit',
    title: 'Zoom to fit',
    group: 'view',
    tooltip: () => 'Show the whole sample',
    enabled: loaded,
    run: (subject) => {
      const open = openWave(subject)
      if (open) useWaveEditorStore.getState().zoom(open.key, 'fit')
    },
  },
  {
    id: 'sample-selection.play',
    title: (subject) => (isWavePreviewing(subject.sampleId) ? 'Stop' : hasSelection(subject) ? 'Play selection' : 'Play from cursor'),
    group: 'view',
    enabled: (subject) => isWavePreviewing(subject.sampleId) || ready(subject),
    run: (subject, { samples }) => toggleWavePreview(samples, subject),
  },
]

/**
 * A Wave editor pane's lanes: its sample's selection and cursor in that pane, and the clipboard, read from the stores. The edit keys reach
 * Cut, Copy, Paste and Delete through their verbs; everything runs through `state/wave-edits.ts`, as the toolbar does.
 * The five clipboard and structure edits are one group, as on the toolbar.
 */
export const sampleSelectionActions: readonly Action<SelectionSubject>[] = actions.map((action) => ({
  ...action,
  applies: (subject, context) => inProject(subject) && (action.applies?.(subject, context) ?? true),
}))
