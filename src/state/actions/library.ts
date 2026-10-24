import { type LibraryCatalog, type LibraryItem, type SnapshotScope, saveLibraryFolder, saveLibraryItem, trashLibraryEntry } from '@core'
import { useLibraryStore } from '../library-store'
import { useSelectionStore } from '../selection-store'
import { project } from './lookup'
import { renameAction, startRename } from './rename'
import type { Action, ActionContext, SubjectOf } from './types'

type ItemSubject = SubjectOf<'library-item'>
type FolderSubject = SubjectOf<'library-folder'>

const catalog = () => useLibraryStore.getState().catalog
const itemOf = ({ itemId }: ItemSubject) => catalog().items.find((item) => item.id === itemId)
const folderOf = ({ folderId }: FolderSubject) => catalog().folders.find((folder) => folder.id === folderId)

/** Edits the catalog through the library and keeps the store's copy current. */
const update = async (context: ActionContext, edit: (catalog: LibraryCatalog) => LibraryCatalog, message: string) => {
  useLibraryStore.getState().setCatalog(await context.library.update(edit))
  return message
}

/** Whether an item can be inserted as a new instrument track: an instrument, or a preset of one. */
export const isInstrumentItem = (value: LibraryCatalog, item: LibraryItem): boolean =>
  item.content.kind === 'instrument' || (item.content.kind === 'preset' && value.revisions.find((revision) => item.content.kind === 'preset' && revision.id === item.content.revisionId)?.payload.kind === 'instrument')

/**
 * Where *Replace selected graph* puts an item: the selected track (or the first) or the master, in the graph its kind
 * belongs to; a sample or clip takes `domain`.
 */
export const insertionScope = (item: LibraryItem, domain: SnapshotScope['domain'] = 'patch'): SnapshotScope => {
  const selection = useSelectionStore.getState()
  const tracks = project().tracks
  const track = tracks.find((candidate) => candidate.id === selection.trackId) ?? tracks[0]
  const content = item.content
  return {
    owner: selection.master ? { kind: 'master' } : { kind: 'track', trackId: track?.id ?? '' },
    domain: content.kind === 'instrument' ? 'patch' : content.kind === 'note-effect' ? 'notes' : content.kind === 'audio-effect' ? 'fx' : content.kind === 'preset' ? content.state.scope.domain : selection.master ? 'fx' : domain,
  }
}

const live = (subject: ItemSubject) => !!itemOf(subject) && !itemOf(subject)?.trashed
const isClip = (item: LibraryItem | undefined) => item?.content.kind === 'audio-clip' || item?.content.kind === 'midi-clip'

/** An item of the personal library. Its actions are asynchronous and resolve with what they did. */
export const libraryItemActions: readonly Action<ItemSubject>[] = [
  {
    id: 'library-item.preview',
    title: 'Preview',
    group: 'open',
    applies: live,
    run: async (subject, { library }) => {
      const item = itemOf(subject)
      if (item && (await library.preview(item)) === 'started') return 'Preview in isolated engine · effects use a test tone'
    },
  },
  renameAction('library-item', live),
  {
    id: 'library-item.duplicate',
    title: 'Duplicate',
    group: 'edit',
    applies: live,
    // The copy takes the item's presets along.
    run: (subject, context) =>
      update(context, (value) => {
        const item = value.items.find((candidate) => candidate.id === subject.itemId)
        if (!item) throw new Error('That library item is gone')
        const id = crypto.randomUUID()
        let next = saveLibraryItem(value, { ...item, id, name: `${item.name} copy` })
        for (const preset of value.items) {
          if (!preset.trashed && preset.content.kind === 'preset' && preset.content.assetId === item.id) next = saveLibraryItem(next, { ...preset, id: crypto.randomUUID(), content: { ...preset.content, assetId: id } })
        }
        return next
      }, 'Library saved'),
  },
  {
    id: 'library-item.insert-track',
    title: 'Insert new instrument track',
    group: 'edit',
    applies: live,
    enabled: (subject) => isInstrumentItem(catalog(), itemOf(subject)!),
    run: (subject, { library }) => library.insert(itemOf(subject)!, { mode: 'new-track' }),
  },
  {
    id: 'library-item.replace',
    title: (subject) => (itemOf(subject)?.content.kind === 'sample' ? 'Add sample to project' : 'Replace selected graph'),
    group: 'edit',
    applies: (subject) => live(subject) && !isClip(itemOf(subject)),
    run: (subject, { library }) => {
      const item = itemOf(subject)!
      return library.insert(item, { mode: 'replace', scope: insertionScope(item) })
    },
  },
  {
    id: 'library-item.trash',
    title: 'Trash',
    group: 'delete',
    danger: true,
    applies: live,
    // Its presets go with it; the trash keeps their dependencies and sample bytes.
    run: (subject, context) => {
      context.library.stopPreview()
      return update(context, (value) => trashLibraryEntry(value, subject.itemId), 'Moved to the trash')
    },
  },
  {
    id: 'library-item.restore',
    title: 'Restore',
    group: 'delete',
    applies: (subject) => !!itemOf(subject)?.trashed,
    run: (subject, context) => update(context, (value) => trashLibraryEntry(value, subject.itemId, false), 'Restored'),
  },
]

const liveFolder = (subject: FolderSubject) => !!folderOf(subject) && !folderOf(subject)?.trashed

/** A folder of the personal library. */
export const libraryFolderActions: readonly Action<FolderSubject>[] = [
  {
    id: 'library-folder.open',
    title: 'Open',
    group: 'open',
    applies: liveFolder,
    run: ({ folderId }) => useLibraryStore.getState().open(folderId),
  },
  renameAction('library-folder', liveFolder),
  {
    id: 'library-folder.new-folder',
    title: 'New folder inside',
    group: 'edit',
    applies: liveFolder,
    takesFocus: true,
    // Made as "New folder", opened and named in place.
    run: async ({ folderId }, context) => {
      const id = crypto.randomUUID()
      await update(context, (value) => saveLibraryFolder(value, 'New folder', folderId, id), 'Library saved')
      useLibraryStore.getState().open(id)
      startRename({ kind: 'library-folder', folderId: id }, context)
    },
  },
  {
    id: 'library-folder.trash',
    title: 'Trash',
    group: 'delete',
    danger: true,
    applies: liveFolder,
    run: async ({ folderId }, context) => {
      const message = await update(context, (value) => trashLibraryEntry(value, folderId), 'Moved to the trash with its contents')
      if (useLibraryStore.getState().openFolder === folderId) useLibraryStore.getState().open(null)
      return message
    },
  },
  {
    id: 'library-folder.restore',
    title: 'Restore',
    group: 'delete',
    applies: (subject) => !!folderOf(subject)?.trashed,
    run: ({ folderId }, context) => update(context, (value) => trashLibraryEntry(value, folderId, false), 'Restored'),
  },
]
