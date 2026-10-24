import { captureSnapshot, deleteProjectPreset, deleteSnapshot, duplicateProjectPreset, duplicateSnapshot, putSnapshot, saveProjectPreset } from '@core'
import { editPresetProject, recallSavedSound } from '../preset-actions'
import { project } from './lookup'
import { renameAction } from './rename'
import type { Action, SubjectOf } from './types'

type SoundSubject = SubjectOf<'sound'>

const snapshotOf = ({ soundId }: SoundSubject) => project().snapshots?.find((snapshot) => snapshot.id === soundId)
const presetOf = ({ soundId }: SoundSubject) => project().presets?.find((preset) => preset.id === soundId)
const exists = (subject: SoundSubject) => !!(subject.preset ? presetOf(subject) : snapshotOf(subject))

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
  renameAction('sound', exists),
  {
    id: 'sound.duplicate',
    title: 'Duplicate',
    group: 'edit',
    applies: exists,
    run: (subject) => saved((value) => (subject.preset ? duplicateProjectPreset(value, presetOf(subject)!) : duplicateSnapshot(value, snapshotOf(subject)!))),
  },
  {
    id: 'sound.delete',
    title: 'Delete',
    group: 'delete',
    danger: true,
    applies: exists,
    run: (subject) => saved((value) => (subject.preset ? deleteProjectPreset(value, subject.soundId) : deleteSnapshot(value, subject.soundId))),
  },
]
