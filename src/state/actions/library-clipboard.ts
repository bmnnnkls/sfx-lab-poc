import { isFactoryId } from '@core'
import { catalogOf, useLibraryStore } from '../library-store'
import { type LibraryClipEntry, copyToLibraryClipboard, libraryClipboard } from './clipboards'
import { dropFor } from './drops'
import { type LibraryEntry, type LibraryPlace, landLibraryEntries, libraryLanding } from './library-landing'
import type { Action, ActionContext, SubjectOf } from './types'

type ItemSubject = SubjectOf<'library-item'>
type FolderSubject = SubjectOf<'library-folder'>
type RootSubject = SubjectOf<'library-root'>

const itemOf = (itemId: string) => catalogOf(itemId).items.find((item) => item.id === itemId)
const folderOf = (folderId: string) => catalogOf(folderId).folders.find((folder) => folder.id === folderId)

/** A live item of My library that moves: not a preset, which goes where its sound goes. */
const cuttable = (itemId: string) => {
  const item = itemOf(itemId)
  return !isFactoryId(itemId) && !!item && !item.trashed && item.content.kind !== 'preset'
}
/** A live item that copies in: the Factory's, or My library's but a preset. */
const copyable = (itemId: string) => {
  const item = itemOf(itemId)
  return !!item && !item.trashed && (isFactoryId(itemId) || item.content.kind !== 'preset')
}
const liveFolder = (folderId: string) => !!folderOf(folderId) && !folderOf(folderId)!.trashed

/** What a cut or copy of an item takes: the selection when the item is in it, of the items that can go; else the item. */
const takenWith = (itemId: string, can: (id: string) => boolean): LibraryEntry[] => {
  const { selected } = useLibraryStore.getState()
  const ids = selected.length > 1 && selected.includes(itemId) ? selected.filter(can) : [itemId]
  return ids.map((id) => ({ kind: 'library-item', itemId: id }))
}

const cut = (entries: readonly LibraryEntry[]) => libraryClipboard.set({ mode: 'cut', entries })

/** Whether what is on the library clipboard can be pasted onto `place` now. */
const canPaste = (place: LibraryPlace, context: ActionContext): boolean => {
  const clip = libraryClipboard.get()
  if (!clip || clip.entries.length === 0) return false
  const [first] = clip.entries
  if (first && !isLibraryEntry(first)) return !!dropFor(first, place, context)
  return !!libraryLanding(clip.entries as LibraryEntry[], place, clip.mode === 'cut' ? 'move' : 'copy')
}

const isLibraryEntry = (entry: LibraryClipEntry): entry is LibraryEntry => entry.kind === 'library-item' || entry.kind === 'library-folder'

/**
 * *Paste here*: cut things move to `place` and leave the clipboard; copied ones are copied in (a Factory thing into My
 * library, a thing of *This project* saved there, as dropping it does) and stay on it.
 */
const paste = async (place: LibraryPlace, context: ActionContext) => {
  const clip = libraryClipboard.get()
  if (!clip) return
  const [first] = clip.entries
  if (first && !isLibraryEntry(first)) return dropFor(first, place, context)?.run(first, place, context, { alt: false })
  const report = await landLibraryEntries(clip.entries as LibraryEntry[], place, clip.mode === 'cut' ? 'move' : 'copy', context)
  if (clip.mode === 'cut' && libraryClipboard.get() === clip) libraryClipboard.set(null)
  return report
}

const pasteAction = <S extends FolderSubject | RootSubject>(id: string, applies: (subject: S) => boolean): Action<S> => ({
  id,
  verb: 'paste',
  title: 'Paste here',
  group: 'clipboard',
  applies,
  enabled: (subject, context) => canPaste(subject, context),
  run: (subject, context) => paste(subject, context),
})

/** Cut and Copy on an item, of the selection when the item is in it. The Factory's copy, and can't be cut. */
export const libraryItemClipboardActions: readonly Action<ItemSubject>[] = [
  {
    id: 'library-item.cut',
    verb: 'cut',
    title: 'Cut',
    group: 'clipboard',
    applies: ({ itemId }) => cuttable(itemId),
    run: ({ itemId }) => cut(takenWith(itemId, cuttable)),
  },
  {
    id: 'library-item.copy',
    verb: 'copy',
    title: 'Copy',
    group: 'clipboard',
    applies: ({ itemId }) => copyable(itemId),
    run: ({ itemId }) => copyToLibraryClipboard(takenWith(itemId, copyable)),
  },
]

/** Cut, Copy and *Paste here* on a folder; the Factory's only copy. */
export const libraryFolderClipboardActions: readonly Action<FolderSubject>[] = [
  {
    id: 'library-folder.cut',
    verb: 'cut',
    title: 'Cut',
    group: 'clipboard',
    applies: ({ folderId }) => liveFolder(folderId) && !isFactoryId(folderId),
    run: (subject) => cut([subject]),
  },
  {
    id: 'library-folder.copy',
    verb: 'copy',
    title: 'Copy',
    group: 'clipboard',
    applies: ({ folderId }) => liveFolder(folderId),
    run: (subject) => copyToLibraryClipboard([subject]),
  },
  pasteAction<FolderSubject>('library-folder.paste', ({ folderId }) => liveFolder(folderId) && !isFactoryId(folderId)),
]

/** *Paste here* on *My library*: to the top level. */
export const libraryRootClipboardActions: readonly Action<RootSubject>[] = [pasteAction<RootSubject>('library-root.paste', ({ root }) => root === 'mine')]
