import { type ControlOwner, type ProjectPreset, type SnapshotScope, canRecallProjectPreset, captureSnapshot, deleteProjectPreset, deleteSnapshot, duplicateProjectPreset, duplicateSnapshot, putSnapshot, saveProjectPreset } from '@core'
import { editPresetProject, recallSavedSound } from '../preset-actions'
import { saveToLibrary } from './library-save'
import { project } from './lookup'
import { renameAction } from './rename'
import type { Action, SubjectOf } from './types'

type SoundSubject = SubjectOf<'sound'>

const snapshotOf = ({ soundId }: SoundSubject) => project().snapshots?.find((snapshot) => snapshot.id === soundId)
const presetOf = ({ soundId }: SoundSubject) => project().presets?.find((preset) => preset.id === soundId)
const exists = (subject: SoundSubject) => !!(subject.preset ? presetOf(subject) : snapshotOf(subject))

/** Whether a project preset can be recalled onto `owner`, in `domain`: the owner's graph matches the preset's revision. */
export const canRecallPresetOn = (preset: ProjectPreset, owner: ControlOwner, domain: SnapshotScope['domain'] = preset.scope.domain): boolean =>
  canRecallProjectPreset(project(), preset, { owner, domain })

/**
 * Recalls a project preset onto `owner`, in its own domain by default: a preset dropped on a track, and Sounds' *Recall*
 * button with the view's scope. It reports what it recalled, or throws why it couldn't.
 */
export const recallPresetOn = (preset: ProjectPreset, owner: ControlOwner, domain: SnapshotScope['domain'] = preset.scope.domain): string =>
  recallSavedSound(preset, { owner, domain })

/** A sound edit as one undo step; it reports what it did, or throws why it couldn't. */
const saved = async (edit: Parameters<typeof editPresetProject>[0]) => {
  editPresetProject(edit)
  return 'Sound saved'
}

/** A snapshot or a project preset in the Sounds view. */
export const soundActions: readonly Action<SoundSubject>[] = [
  {
    id: 'sound.recall',
    title: 'Recall',
    group: 'open',
    applies: exists,
    // A preset recalls onto the scope it was saved from.
    run: async (subject) => recallSavedSound((subject.preset ? presetOf(subject) : snapshotOf(subject))!),
  },
  {
    id: 'sound.update',
    title: 'Update',
    group: 'edit',
    applies: exists,
    run: (subject) =>
      saved((value) => {
        if (subject.preset) {
          const preset = presetOf(subject)!
          return saveProjectPreset(value, preset.scope, preset.name, preset.id)
        }
        const snapshot = snapshotOf(subject)!
        return putSnapshot(value, captureSnapshot(value, snapshot.scope, snapshot.name, snapshot.id))
      }),
  },
  {
    id: 'sound.save-to-library',
    title: 'Save to library',
    group: 'edit',
    tooltip: () => "A new library sound from this preset's own graph, holding only this preset",
    // A snapshot has no graph of its own to save.
    applies: (subject) => subject.preset && exists(subject),
    run: ({ soundId }, context) => saveToLibrary({ kind: 'preset', presetId: soundId }, context),
  },
  renameAction('sound', exists),
  {
    id: 'sound.duplicate',
    verb: 'duplicate',
    title: 'Duplicate',
    group: 'edit',
    applies: exists,
    run: (subject) => saved((value) => (subject.preset ? duplicateProjectPreset(value, presetOf(subject)!) : duplicateSnapshot(value, snapshotOf(subject)!))),
  },
  {
    id: 'sound.delete',
    verb: 'delete',
    title: 'Delete',
    group: 'delete',
    danger: true,
    applies: exists,
    run: (subject) => saved((value) => (subject.preset ? deleteProjectPreset(value, subject.soundId) : deleteSnapshot(value, subject.soundId))),
  },
]
