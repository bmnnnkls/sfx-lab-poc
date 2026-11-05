import { type ControlOwner, type Project, type ProjectPreset, type SnapshotScope, canRecallProjectPreset, captureSnapshot, controlOwnerId, deleteProjectPreset, deleteSnapshot, duplicateProjectPreset, duplicateSnapshot, putSnapshot, saveProjectPreset } from '@core'
import { editPresetProject, recallSavedSound } from '../preset-actions'
import { scopeState, useSoundsStore } from '../sounds-store'
import { saveToLibrary } from './library-save'
import { ownerName, project } from './lookup'
import { renameAction, startRename } from './rename'
import type { Action, ActionContext, SubjectOf } from './types'

type SoundSubject = SubjectOf<'sound'>

const snapshotOf = ({ soundId }: SoundSubject) => project().snapshots?.find((snapshot) => snapshot.id === soundId)
const presetOf = ({ soundId }: SoundSubject) => project().presets?.find((preset) => preset.id === soundId)
const exists = (subject: SoundSubject) => !!(subject.preset ? presetOf(subject) : snapshotOf(subject))
const sameOwner = (a: ControlOwner, b: ControlOwner) => a.kind === b.kind && controlOwnerId(a) === controlOwnerId(b)

/**
 * A sound's subject, keys in one order, so a row's in-place rename matches the subject its menu or a save started it
 * with (`sameSubject` compares them as JSON). `onto`: the selected owner its row recalls onto.
 */
export const soundSubject = (soundId: string, preset: boolean, onto?: ControlOwner): SoundSubject =>
  onto ? { kind: 'sound', soundId, preset, onto } : { kind: 'sound', soundId, preset }

/** The first *Bass n* (n from 1) that no snapshot or preset of `owner` is named. */
export const nextSoundName = (value: Project, owner: ControlOwner): string => {
  const name = ownerName(owner)
  const used = new Set([...(value.snapshots ?? []), ...(value.presets ?? [])].filter((sound) => sameOwner(sound.scope.owner, owner)).map((sound) => sound.name))
  let n = 1
  while (used.has(`${name} ${n}`)) n++
  return `${name} ${n}`
}

/**
 * Saves a preset or a snapshot of `scope`, named after its owner (*Bass 1*), as one undo step, and starts renaming its
 * row in Sounds. `onto` is the row's: the selected owner, or none with *Show all*. Throws why it couldn't.
 */
export const saveSound = (kind: 'preset' | 'snapshot', scope: SnapshotScope, context: ActionContext, onto?: ControlOwner): string => {
  const name = nextSoundName(project(), scope.owner)
  let id = ''
  editPresetProject((value) => {
    if (kind === 'preset') {
      const saved = saveProjectPreset(value, scope, name)
      id = saved.presets!.at(-1)!.id
      return saved
    }
    const snapshot = captureSnapshot(value, scope, name)
    id = snapshot.id
    return putSnapshot(value, snapshot)
  })
  startRename(soundSubject(id, kind === 'preset', onto), { ...context, origin: 'sounds' })
  return `Saved ${name}`
}

/** Whether a project preset can be recalled onto `owner`, in `domain`: the owner's graph matches the preset's revision. */
export const canRecallPresetOn = (preset: ProjectPreset, owner: ControlOwner, domain: SnapshotScope['domain'] = preset.scope.domain): boolean =>
  canRecallProjectPreset(project(), preset, { owner, domain })

/** Recalls a project preset onto `owner`, in its own domain by default: a preset dropped on a track. It reports what it recalled, or throws why it couldn't. */
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
    // Onto the selection in Sounds (`onto`), else the sound's own owner. A snapshot holds its own owner's controls.
    enabled: (subject) => !subject.preset || !subject.onto || canRecallPresetOn(presetOf(subject)!, subject.onto),
    tooltip: (subject) => (subject.preset && subject.onto && !canRecallPresetOn(presetOf(subject)!, subject.onto) ? `${ownerName(subject.onto)}'s graph isn't this preset's` : undefined),
    run: async (subject) => {
      const sound = (subject.preset ? presetOf(subject) : snapshotOf(subject))!
      const scope = { owner: subject.preset && subject.onto ? subject.onto : sound.scope.owner, domain: sound.scope.domain }
      const message = subject.preset ? recallSavedSound(sound, scope) : recallSavedSound(sound)
      useSoundsStore.getState().markRecalled({ soundId: sound.id, scope, state: scopeState(project(), scope, subject.preset) })
      return message
    },
  },
  ...(['a', 'b'] as const).map((end): Action<SoundSubject> => ({
    id: `sound.set-${end}`,
    title: `Set as ${end.toUpperCase()}`,
    group: 'open',
    separated: end === 'a',
    tooltip: () => `The morph's ${end.toUpperCase()} end`,
    // Morph is between snapshots.
    applies: (subject) => !subject.preset && exists(subject),
    run: ({ soundId }) => {
      const store = useSoundsStore.getState()
      if (end === 'a') store.setA(soundId)
      else store.setB(soundId)
    },
  })),
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
