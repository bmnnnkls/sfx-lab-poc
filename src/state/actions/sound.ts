import { type ControlOwner, type Project, type ProjectPreset, type SnapshotScope, assetSignature, canRecallProjectPreset, captureAsset, captureSnapshot, controlOwnerId, deleteProjectPreset, deleteSnapshot, duplicateProjectPreset, duplicateSnapshot, isFactoryId, linkedSounds, presetLink, putSnapshot, saveProjectPreset } from '@core'
import { useLibraryStore } from '../library-store'
import { editPresetProject, recallSavedSound } from '../preset-actions'
import { scopeState, useSoundsStore } from '../sounds-store'
import { copyToLibraryClipboard } from './clipboards'
import { saveToLibrary } from './library-save'
import { ownerName, project } from './lookup'
import { renameAction, startRename } from './rename'
import type { Action, ActionContext, ActionReport, SubjectOf } from './types'

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

/**
 * The presets Sounds lists for `owner`'s `domain`: those whose graph matches the owner's, its own and other owners'.
 * The owner's graph is captured once, not once per preset.
 */
export const recallablePresets = (value: Project, owner: ControlOwner, domain: SnapshotScope['domain']): readonly ProjectPreset[] => {
  const presets = (value.presets ?? []).filter((preset) => preset.scope.domain === domain)
  if (presets.length === 0 || domain === 'track') return []
  let signature: string
  try {
    signature = assetSignature(captureAsset(value, { owner, domain }))
  } catch {
    return []
  }
  return presets.filter((preset) => value.assetRevisions?.find((revision) => revision.id === preset.revisionId)?.signature === signature)
}

/** Recalls a project preset onto `owner`, in its own domain by default: a preset dropped on a track. It reports what it recalled, or throws why it couldn't. */
export const recallPresetOn = (preset: ProjectPreset, owner: ControlOwner, domain: SnapshotScope['domain'] = preset.scope.domain): string =>
  recallSavedSound(preset, { owner, domain })

/**
 * The library link a project preset saves back through: its own revision's shape is the link's (`presetLink`). A link to
 * a Factory sound isn't one: the Factory is read-only, so its presets save as a sound of their own.
 */
const linkOfPreset = (presetId: string) => {
  const value = project(), preset = value.presets?.find((candidate) => candidate.id === presetId)
  const origin = preset ? presetLink(value, preset) : undefined
  return origin && !isFactoryId(origin.itemId) ? origin : undefined
}

/**
 * *Save to library* on a preset: with a link to a library sound that is there and not trashed, adds it to that sound
 * ("Added *Deep* to *Big bass*", with *Show*); otherwise a new library sound holding only this preset.
 */
export const savePresetToLibrary = async (presetId: string, context: ActionContext): Promise<ActionReport> => {
  const origin = linkOfPreset(presetId), name = project().presets?.find((candidate) => candidate.id === presetId)?.name ?? 'Preset'
  if (origin) {
    const before = await context.library.read()
    const { sound, trashed } = linkedSounds(before, origin)
    if (sound && !trashed) {
      const next = await context.library.addPresetToSound(presetId)
      useLibraryStore.getState().setCatalog(next)
      const known = new Set(before.items.map((item) => item.id)), added = next.items.find((item) => !known.has(item.id))
      const message = `Added ${name} to ${sound.name}`
      return added ? { message, action: { label: 'Show', run: () => useLibraryStore.getState().reveal(added.id) } } : { message }
    }
  }
  return saveToLibrary({ kind: 'preset', presetId }, context)
}

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
    tooltip: (subject) => (linkOfPreset(subject.soundId) ? 'Adds this preset to the library sound it came from' : "A new library sound from this preset's own graph, holding only this preset"),
    // A snapshot has no graph of its own to save.
    applies: (subject) => subject.preset && exists(subject),
    run: ({ soundId }, context) => savePresetToLibrary(soundId, context),
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
    id: 'sound.copy',
    verb: 'copy',
    title: 'Copy',
    group: 'clipboard',
    // A preset row of This project, in the Library: onto the library's clipboard, so *Paste here* saves it.
    applies: (subject, { origin }) => origin === 'library' && subject.preset && exists(subject),
    run: ({ soundId, preset }) => copyToLibraryClipboard([{ kind: 'sound', soundId, preset }]),
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
