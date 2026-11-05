import { type ControlOwner, type LibraryBundleSelection, type LibraryCatalog, type LibraryItem, type SnapshotScope, type Track, EFFECT_INPUTS, copyLibraryEntries, duplicateLibraryFolder, isFactoryId, libraryItemDuplicate, moveLibraryEntry, saveLibraryFolder, trashLibraryEntry } from '@core'
import { useLayoutStore } from '../layout-store'
import { catalogOf, fromOf, openFolder, useLibraryStore } from '../library-store'
import { useSelectionStore } from '../selection-store'
import { project, trackOf } from './lookup'
import { renameAction, startRename } from './rename'
import type { Action, ActionChoice, ActionContext, ActionReport, SubjectOf } from './types'

type ItemSubject = SubjectOf<'library-item'>
type FolderSubject = SubjectOf<'library-folder'>
type RootSubject = SubjectOf<'library-root'>

const catalog = () => useLibraryStore.getState().catalog
/** An item or folder of the personal library or the Factory, by its id. */
const itemOf = ({ itemId }: ItemSubject) => catalogOf(itemId).items.find((item) => item.id === itemId)
const folderOf = ({ folderId }: FolderSubject) => catalogOf(folderId).folders.find((folder) => folder.id === folderId)

/** Edits the catalog through the library and keeps the store's copy current; resolves with `message`. */
export const editLibrary = async (context: ActionContext, edit: (catalog: LibraryCatalog) => LibraryCatalog, message: string) => {
  useLibraryStore.getState().setCatalog(await context.library.update(edit))
  return message
}

/**
 * Copies Factory items or folders into My library's `folderId` (null: the top level), as editable entries with new ids
 * (`copyLibraryEntries`): *Copy to My library*, and a Factory row dragged onto My library. Reports "Copied Kick to
 * Drums", with *Show*, which makes the copy active and names it in place. `also` is an edit of My library made in the
 * same update, first, with the message to report in place of that one (several things landing at once).
 */
export const copyToMine = async (ids: readonly string[], folderId: string | null, context: ActionContext, also?: { readonly edit: (catalog: LibraryCatalog) => LibraryCatalog; readonly message: string }): Promise<ActionReport> => {
  const { factory } = useLibraryStore.getState()
  if (!factory) throw new Error('The Factory is still loading')
  let known = new Set<string>()
  const next = await context.library.update((value) => {
    known = new Set([...value.folders.map((folder) => folder.id), ...value.items.map((item) => item.id)])
    return copyLibraryEntries(factory, also ? also.edit(value) : value, ids, folderId)
  })
  useLibraryStore.getState().setCatalog(next)
  const first = ids[0] ?? ''
  const name = [...factory.items, ...factory.folders].find((entry) => entry.id === first)?.name ?? 'Factory sound'
  const where = folderId === null ? 'My library' : (next.folders.find((folder) => folder.id === folderId)?.name ?? 'My library')
  // The copy to show: the top folder copied, or else the first item that isn't a preset.
  const folder = next.folders.find((candidate) => !known.has(candidate.id) && candidate.parentId === folderId)
  const item = next.items.find((candidate) => !known.has(candidate.id) && candidate.content.kind !== 'preset')
  // As a save's *Show*: the copy becomes active, named in place.
  const show = folder
    ? () => {
        useLibraryStore.getState().setActive({ kind: 'folder', id: folder.id })
        useLayoutStore.getState().revealView('library')
        startRename({ kind: 'library-folder', folderId: folder.id }, { ...context, origin: 'library' })
      }
    : item
      ? () => {
          useLibraryStore.getState().reveal(item.id)
          startRename({ kind: 'library-item', itemId: item.id }, { ...context, origin: 'library' })
        }
      : undefined
  const message = also?.message ?? `Copied ${ids.length > 1 ? `${ids.length} things` : name} to ${where}`
  return show ? { message, action: { label: 'Show', run: show } } : { message }
}

/** Whether an item can be inserted as a new instrument track: an instrument, or a preset of one. */
export const isInstrumentItem = (value: LibraryCatalog, item: LibraryItem): boolean =>
  item.content.kind === 'instrument' || (item.content.kind === 'preset' && value.revisions.find((revision) => item.content.kind === 'preset' && revision.id === item.content.revisionId)?.payload.kind === 'instrument')

/** The selected track (or the first), group or the master: where *Replace selected graph* puts an item. */
const selectedOwner = (): ControlOwner => {
  const selection = useSelectionStore.getState()
  const tracks = project().tracks
  const track = tracks.find((candidate) => candidate.id === selection.trackId) ?? tracks[0]
  if (selection.groupId !== null) return { kind: 'group', groupId: selection.groupId }
  return selection.master ? { kind: 'master' } : { kind: 'track', trackId: track?.id ?? '' }
}

/**
 * Where an item goes on `owner` (the selection's by default): in the graph its kind belongs to; a sample or clip takes
 * `domain`.
 */
export const insertionScope = (item: LibraryItem, domain: SnapshotScope['domain'] = 'patch', owner: ControlOwner = selectedOwner()): SnapshotScope => {
  const content = item.content
  return {
    owner,
    domain: content.kind === 'instrument' ? 'patch' : content.kind === 'note-effect' ? 'notes' : content.kind === 'audio-effect' ? 'fx' : content.kind === 'preset' ? content.state.scope.domain : owner.kind !== 'track' ? 'fx' : domain,
  }
}

/** Replaces a graph by a library instrument, effect or preset: *Replace selected graph*, and an item dropped on a track or a canvas. */
export const replaceGraph = (item: LibraryItem, scope: SnapshotScope, { library }: ActionContext): Promise<string> =>
  library.insert(item, { mode: 'replace', scope }, undefined, undefined, fromOf(item.id))

/**
 * Whether a library instrument, effect or preset can replace a graph of `owner`: an instrument or note effect on an
 * instrument track, an audio effect on a track, a bus or the master whose input it was made for (`EFFECT_INPUTS`).
 * The item is read in its catalog (the personal one or the Factory's), or in `from` (a throwaway capture of a graph of the
 * project).
 */
export const graphFitsOwner = (item: LibraryItem, owner: ControlOwner, from: LibraryCatalog = catalogOf(item.id)): boolean => {
  const content = item.content
  if (item.trashed || !('revisionId' in content)) return false
  const payload = from.revisions.find((revision) => revision.id === content.revisionId)?.payload
  const track = owner.kind === 'track' ? trackOf(owner.trackId) : undefined
  const bus = owner.kind === 'group' ? project().groups?.find((group) => group.id === owner.groupId)?.bus : undefined
  if (!payload || (owner.kind === 'track' && !track) || (owner.kind === 'group' && !bus)) return false
  if (payload.kind !== 'audio-effect') return track?.kind === 'instrument'
  const input = owner.kind === 'master' ? 'masterIn' : owner.kind === 'group' ? 'groupIn' : track?.kind === 'return' ? 'returnIn' : 'trackIn'
  return ![payload.graph, ...payload.modules.map((module) => module.patch)].some((graph) => graph.nodes.some((node) => EFFECT_INPUTS.includes(node.type) && node.type !== input))
}

/** Whether a library clip can go into a slot: an empty one of a track of its kind, an audio clip's sample at hand. */
export const libraryClipFitsSlot = (item: LibraryItem, trackId: string, scene: number): boolean => {
  const content = item.content, track = trackOf(trackId)
  if (item.trashed || (content.kind !== 'midi-clip' && content.kind !== 'audio-clip') || !track || track.kind === 'return' || !!track.clips[scene]) return false
  if ((track.kind === 'instrument') !== (content.kind === 'midi-clip')) return false
  return content.kind === 'midi-clip' || [...project().samples, ...catalogOf(item.id).samples].some((sample) => sample.id === content.clip.sampleId)
}

/** Inserts a library clip into an empty slot of `owner`'s: the Library's *Insert into empty slot*, and a clip dropped on a slot. */
export const insertLibraryClipAt = (item: LibraryItem, owner: ControlOwner, scene: number, { library }: ActionContext): Promise<string> =>
  library.insert(item, { mode: 'replace', scope: { owner, domain: 'patch' } }, scene, undefined, fromOf(item.id))

const live = (subject: ItemSubject) => !!itemOf(subject) && !itemOf(subject)?.trashed
/** A live item of the personal library: the Factory's are used and copied, never edited. */
const editable = (subject: ItemSubject) => live(subject) && !isFactoryId(subject.itemId)
const isClip = (item: LibraryItem | undefined) => item?.content.kind === 'audio-clip' || item?.content.kind === 'midi-clip'
const sceneName = (scene: number): string => project().sceneNames?.[scene] || `Scene ${scene + 1}`

/**
 * The track a library clip goes to from its menu and the Library's button: the selected track when it is of the
 * clip's kind, or else the first track that is.
 */
export const clipTrackFor = (item: LibraryItem): Track | undefined => {
  const kind = item.content.kind === 'midi-clip' ? 'instrument' : 'audio'
  const selected = trackOf(useSelectionStore.getState().trackId ?? '')
  return selected?.kind === kind ? selected : project().tracks.find((track) => track.kind === kind)
}

/** Why a library clip can't go into `scene` of `track`, or undefined when it can. */
const clipRefusal = (item: LibraryItem, track: Track | undefined, scene: number): string | undefined => {
  if (!track) return item.content.kind === 'midi-clip' ? 'There is no instrument track' : 'There is no audio track'
  if (track.kind !== 'return' && track.clips[scene]) return `${track.name} has a clip there`
  return libraryClipFitsSlot(item, track.id, scene) ? undefined : 'Its sample is missing'
}

/** One choice per scene: an empty slot to insert into, or (`replace`) a clip to replace. Disabled ones say why. */
const sceneChoices = (item: LibraryItem, replace: boolean): ActionChoice[] => {
  const track = clipTrackFor(item)
  return Array.from({ length: project().sceneCount }, (_, scene) => {
    const occupied = !!track && track.kind !== 'return' && !!track.clips[scene]
    const reason = replace ? (!track ? clipRefusal(item, track, scene) : occupied ? undefined : 'No clip to replace') : clipRefusal(item, track, scene)
    return { id: String(scene), title: sceneName(scene), enabled: !reason, ...(reason && { tooltip: reason }) }
  })
}

/** *Move to*'s choice for the top level. */
const TOP_LEVEL = '-'

/**
 * The live folders as choices, named by their path ("Drums / Kicks") in the tree's order, after *My library*. `exclude`
 * leaves out a folder and what is inside it; `current` is disabled, being where the thing already is.
 */
const folderChoices = (current: string | null, exclude?: string): ActionChoice[] => {
  const folders = catalog().folders.filter((folder) => !folder.trashed)
  const choices: ActionChoice[] = [{ id: TOP_LEVEL, title: 'My library', enabled: current !== null }]
  const visit = (parentId: string | null, path: readonly string[], seen: ReadonlySet<string>) => {
    const children = folders
      .filter((folder) => folder.parentId === parentId && !seen.has(folder.id) && folder.id !== exclude)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }) || (a.id < b.id ? -1 : 1))
    for (const folder of children) {
      const title = [...path, folder.name]
      choices.push({ id: folder.id, title: title.join(' / '), enabled: folder.id !== current })
      visit(folder.id, title, new Set([...seen, folder.id]))
    }
  }
  visit(null, [], new Set())
  return choices
}
const destinationOf = (choice: string | undefined) => (choice === TOP_LEVEL ? null : (choice ?? null))

/** Asks the Library view to review an export: only the view holds the bundle dialog. */
const requestExport = (selection: LibraryBundleSelection, name: string) => {
  useLibraryStore.getState().setRequest({ kind: 'export', selection, name })
  useLayoutStore.getState().revealView('library')
}

/** When the active row went to the trash, the Library moves on to `folderId` (null: *My library*). */
export const moveOffTrash = (folderId: string | null): void => {
  const { active, setActive } = useLibraryStore.getState()
  const trashed = active?.kind === 'folder' ? folderOf({ kind: 'library-folder', folderId: active.id })?.trashed : active?.kind === 'item' ? itemOf({ kind: 'library-item', itemId: active.id })?.trashed : false
  if (trashed) setActive(folderId === null ? null : { kind: 'folder', id: folderId })
}

/** Counts the previews started, so a stopped one clears ■ only while it is the latest. */
let previews = 0

/**
 * Previews a library item, from storage or from `from` (a throwaway catalog: a graph of This project). Its row shows ■
 * until this preview stops; starting another stops this one first.
 */
export const previewLibraryItem = async (item: LibraryItem, { library }: ActionContext, from?: LibraryCatalog): Promise<string | void> => {
  const preview = ++previews
  useLibraryStore.getState().setPreviewing(item.id)
  const stopped = () => { if (preview === previews) useLibraryStore.getState().setPreviewing(null) }
  try {
    if ((await library.preview(item, stopped, from)) === 'started') return 'Preview in isolated engine · effects use a test tone'
  } catch (error) {
    stopped()
    throw error
  }
}

/** An item of the personal library. Its actions are asynchronous and resolve with what they did. */
export const libraryItemActions: readonly Action<ItemSubject>[] = [
  {
    id: 'library-item.preview',
    title: 'Preview',
    group: 'open',
    applies: live,
    run: async (subject, context) => {
      const item = itemOf(subject)
      if (item) return previewLibraryItem(item, context, fromOf(item.id))
    },
  },
  renameAction('library-item', editable),
  {
    id: 'library-item.duplicate',
    verb: 'duplicate',
    title: 'Duplicate',
    group: 'edit',
    applies: editable,
    // The copy takes the item's presets along.
    run: (subject, context) => editLibrary(context, (value) => libraryItemDuplicate(value, subject.itemId), 'Library saved'),
  },
  {
    id: 'library-item.insert-track',
    title: 'Insert new instrument track',
    group: 'edit',
    applies: live,
    enabled: (subject) => isInstrumentItem(catalogOf(subject.itemId), itemOf(subject)!),
    run: (subject, { library }) => library.insert(itemOf(subject)!, { mode: 'new-track' }, undefined, undefined, fromOf(subject.itemId)),
  },
  {
    id: 'library-item.replace',
    title: (subject) => (itemOf(subject)?.content.kind === 'sample' ? 'Add sample to project' : 'Replace selected graph'),
    group: 'edit',
    applies: (subject) => live(subject) && !isClip(itemOf(subject)),
    run: (subject, context) => {
      const item = itemOf(subject)!
      return replaceGraph(item, insertionScope(item), context)
    },
  },
  {
    id: 'library-item.insert-into',
    title: (subject) => `Insert into ${clipTrackFor(itemOf(subject)!)?.name ?? 'track'}`,
    group: 'edit',
    applies: (subject) => live(subject) && isClip(itemOf(subject)),
    choices: (subject) => sceneChoices(itemOf(subject)!, false),
    run: (subject, context, choice) => {
      const item = itemOf(subject)!, track = clipTrackFor(item), scene = Number(choice)
      if (track && choice !== undefined) return insertLibraryClipAt(item, { kind: 'track', trackId: track.id }, scene, context)
    },
  },
  {
    id: 'library-item.replace-clip',
    title: (subject) => `Replace clip in ${clipTrackFor(itemOf(subject)!)?.name ?? 'track'}`,
    group: 'edit',
    applies: (subject) => live(subject) && isClip(itemOf(subject)),
    choices: (subject) => sceneChoices(itemOf(subject)!, true),
    run: (subject, { library }, choice) => {
      const item = itemOf(subject)!, track = clipTrackFor(item)
      if (track && choice !== undefined) return library.insert(item, { mode: 'replace', scope: { owner: { kind: 'track', trackId: track.id }, domain: 'patch' } }, Number(choice), true, fromOf(item.id))
    },
  },
  {
    id: 'library-item.move',
    title: 'Move to',
    group: 'edit',
    // A preset goes where its sound goes.
    applies: (subject) => editable(subject) && itemOf(subject)?.content.kind !== 'preset',
    choices: (subject) => folderChoices(itemOf(subject)?.folderId ?? null),
    run: (subject, context, choice) => editLibrary(context, (value) => moveLibraryEntry(value, subject.itemId, destinationOf(choice)), 'Moved'),
  },
  {
    id: 'library-item.copy-to-mine',
    title: 'Copy to My library',
    group: 'edit',
    applies: (subject) => live(subject) && isFactoryId(subject.itemId),
    // Into the My library folder open before the Factory row was chosen.
    run: (subject, context) => copyToMine([subject.itemId], openFolder(), context),
  },
  {
    id: 'library-item.export',
    title: 'Export as .sfxlib…',
    group: 'edit',
    applies: live,
    takesFocus: true,
    run: (subject) => requestExport({ itemIds: [subject.itemId] }, itemOf(subject)!.name),
  },
  {
    id: 'library-item.trash',
    verb: 'delete',
    title: 'Trash',
    group: 'delete',
    danger: true,
    applies: editable,
    // Its presets go with it; the trash keeps their dependencies and sample bytes. The Library moves on to its folder.
    run: async (subject, context) => {
      context.library.stopPreview()
      const folderId = openFolder()
      const message = await editLibrary(context, (value) => trashLibraryEntry(value, subject.itemId), 'Moved to the trash')
      moveOffTrash(folderId)
      return message
    },
  },
  {
    id: 'library-item.restore',
    title: 'Restore',
    group: 'delete',
    applies: (subject) => !!itemOf(subject)?.trashed,
    run: (subject, context) => editLibrary(context, (value) => trashLibraryEntry(value, subject.itemId, false), 'Restored'),
  },
]

const liveFolder = (subject: FolderSubject) => !!folderOf(subject) && !folderOf(subject)?.trashed
/** A live folder of the personal library: the Factory's open and export, and that is all. */
const editableFolder = (subject: FolderSubject) => liveFolder(subject) && !isFactoryId(subject.folderId)

/** Makes a folder called "New folder" in `parentId`, makes it active and names it in place. */
const newFolder = async (parentId: string | null, context: ActionContext) => {
  const id = crypto.randomUUID()
  await editLibrary(context, (value) => saveLibraryFolder(value, 'New folder', parentId, id), 'Library saved')
  useLibraryStore.getState().setActive({ kind: 'folder', id })
  startRename({ kind: 'library-folder', folderId: id }, context)
}

/** A folder of the personal library. */
export const libraryFolderActions: readonly Action<FolderSubject>[] = [
  {
    id: 'library-folder.open',
    title: 'Open',
    group: 'open',
    applies: liveFolder,
    run: ({ folderId }) => useLibraryStore.getState().setActive({ kind: 'folder', id: folderId }),
  },
  renameAction('library-folder', editableFolder),
  {
    id: 'library-folder.new-folder',
    title: 'New folder inside',
    group: 'edit',
    applies: editableFolder,
    takesFocus: true,
    // Made as "New folder", opened and named in place.
    run: ({ folderId }, context) => newFolder(folderId, context),
  },
  {
    id: 'library-folder.duplicate',
    verb: 'duplicate',
    title: 'Duplicate',
    group: 'edit',
    applies: editableFolder,
    // A deep copy beside it, sharing revisions and samples.
    run: ({ folderId }, context) => editLibrary(context, (value) => duplicateLibraryFolder(value, folderId, folderOf({ kind: 'library-folder', folderId })?.parentId ?? null), 'Library saved'),
  },
  {
    id: 'library-folder.move',
    title: 'Move to',
    group: 'edit',
    applies: editableFolder,
    choices: (subject) => folderChoices(folderOf(subject)?.parentId ?? null, subject.folderId),
    run: ({ folderId }, context, choice) => editLibrary(context, (value) => moveLibraryEntry(value, folderId, destinationOf(choice)), 'Moved'),
  },
  {
    id: 'library-folder.copy-to-mine',
    title: 'Copy to My library',
    group: 'edit',
    applies: (subject) => liveFolder(subject) && isFactoryId(subject.folderId),
    run: (subject, context) => copyToMine([subject.folderId], openFolder(), context),
  },
  {
    id: 'library-folder.export',
    title: 'Export as .sfxlib…',
    group: 'edit',
    applies: liveFolder,
    takesFocus: true,
    run: (subject) => requestExport({ folderIds: [subject.folderId] }, folderOf(subject)!.name),
  },
  {
    id: 'library-folder.trash',
    verb: 'delete',
    title: 'Trash',
    group: 'delete',
    danger: true,
    applies: editableFolder,
    run: async ({ folderId }, context) => {
      const message = await editLibrary(context, (value) => trashLibraryEntry(value, folderId), 'Moved to the trash with its contents')
      moveOffTrash(folderOf({ kind: 'library-folder', folderId })?.parentId ?? null)
      return message
    },
  },
  {
    id: 'library-folder.restore',
    title: 'Restore',
    group: 'delete',
    applies: (subject) => !!folderOf(subject)?.trashed,
    run: ({ folderId }, context) => editLibrary(context, (value) => trashLibraryEntry(value, folderId, false), 'Restored'),
  },
]

const anyLive = () => catalog().items.some((item) => !item.trashed) || catalog().folders.some((folder) => !folder.trashed)
const anyTrashed = () => catalog().items.some((item) => item.trashed) || catalog().folders.some((folder) => folder.trashed)

/** A root of the Library's tree: *My library*, or the trash. */
export const libraryRootActions: readonly Action<RootSubject>[] = [
  {
    id: 'library-root.new-folder',
    title: 'New folder',
    group: 'edit',
    applies: ({ root }) => root === 'mine',
    takesFocus: true,
    run: (_subject, context) => newFolder(null, context),
  },
  {
    id: 'library-root.import',
    title: 'Import .sfxlib…',
    group: 'edit',
    applies: ({ root }) => root === 'mine',
    takesFocus: true,
    run: () => {
      useLibraryStore.getState().setRequest({ kind: 'import' })
      useLayoutStore.getState().revealView('library')
    },
  },
  {
    id: 'library-root.export-all',
    title: 'Export all…',
    group: 'edit',
    applies: ({ root }) => root === 'mine',
    enabled: anyLive,
    takesFocus: true,
    run: () => requestExport({ itemIds: catalog().items.filter((item) => !item.trashed).map((item) => item.id), folderIds: catalog().folders.filter((folder) => !folder.trashed).map((folder) => folder.id) }, 'My library'),
  },
  {
    id: 'library-root.restore-all',
    title: 'Restore all',
    group: 'delete',
    applies: ({ root }) => root === 'trash',
    enabled: anyTrashed,
    run: (_subject, context) =>
      editLibrary(context, (value) => ({ ...value, folders: value.folders.map((folder) => (folder.trashed ? { ...folder, trashed: false } : folder)), items: value.items.map((item) => (item.trashed ? { ...item, trashed: false } : item)) }), 'Restored'),
  },
]
