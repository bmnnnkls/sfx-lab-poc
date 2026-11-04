import { createId } from '../shared'
import type { LibraryCatalog, LibraryFolder, LibraryItem } from './types'

export const libraryName = (name: string): string => {
  const result = name.trim().slice(0, 80)
  if (!result) throw new Error('Enter a name')
  return result
}
const folderExists = (catalog: LibraryCatalog, id: string | null) => {
  if (id !== null && !catalog.folders.some(f => f.id === id && !f.trashed)) throw new Error('Destination folder is unavailable')
}
export const saveLibraryFolder = (catalog: LibraryCatalog, name: string, parentId: string | null, id = createId('folder')): LibraryCatalog => {
  folderExists(catalog, parentId)
  let parent = parentId
  const seen = new Set<string>([id])
  while (parent !== null) {
    if (seen.has(parent)) throw new Error('A folder cannot contain itself')
    seen.add(parent); parent = catalog.folders.find(f => f.id === parent)?.parentId ?? null
  }
  if (!catalog.folders.some(f => f.id === id) && catalog.folders.length >= 1024) throw new Error('Library folder limit reached (1024)')
  const folder: LibraryFolder = { id, name: libraryName(name), parentId }
  return { ...catalog, folders: [...catalog.folders.filter(f => f.id !== id), folder] }
}
export const saveLibraryItem = (catalog: LibraryCatalog, item: LibraryItem): LibraryCatalog => {
  folderExists(catalog, item.folderId)
  if (!catalog.items.some(i => i.id === item.id) && catalog.items.length >= 4096) throw new Error('Library item limit reached (4096)')
  return { ...catalog, items: [...catalog.items.filter(i => i.id !== item.id), { ...item, name: libraryName(item.name) }] }
}
/** Trash keeps all dependencies and bytes, including presets associated with an asset. Restore is independent of project undo. */
export const trashLibraryEntry = (catalog: LibraryCatalog, id: string, trashed = true): LibraryCatalog => {
  const folderIds = new Set<string>()
  const visit = (folder: string) => { if (folderIds.has(folder)) return; folderIds.add(folder); catalog.folders.filter(f => f.parentId === folder).forEach(f => visit(f.id)) }
  if (catalog.folders.some(f => f.id === id)) visit(id)
  const itemIds = new Set(catalog.items.filter(i => i.id === id || (i.folderId !== null && folderIds.has(i.folderId))).map(i => i.id))
  catalog.items.filter(i => i.content.kind === 'preset' && itemIds.has(i.content.assetId)).forEach(i => itemIds.add(i.id))
  if (!trashed) {
    // Restoring a child must also make its parent path visible, without restoring unrelated siblings.
    const restoreParents = (parent: string | null) => {
      const seen = new Set<string>()
      while (parent !== null && !seen.has(parent)) { seen.add(parent); folderIds.add(parent); parent = catalog.folders.find(f => f.id === parent)?.parentId ?? null }
    }
    catalog.folders.filter(f => folderIds.has(f.id)).forEach(f => restoreParents(f.parentId))
    catalog.items.filter(i => itemIds.has(i.id)).forEach(i => restoreParents(i.folderId))
  }
  return { ...catalog, folders: catalog.folders.map(f => folderIds.has(f.id) ? { ...f, trashed } : f), items: catalog.items.map(i => itemIds.has(i.id) ? { ...i, trashed } : i) }
}
export const browseLibrary = (catalog: LibraryCatalog, options: { folderId?: string | null; query?: string; kind?: string; trash?: boolean } = {}) =>
  catalog.items.filter(i => Boolean(i.trashed) === Boolean(options.trash) && (options.folderId === undefined || i.folderId === options.folderId) && (!options.kind || i.content.kind === options.kind) && i.name.toLocaleLowerCase().includes((options.query ?? '').toLocaleLowerCase()))

const LIMITS = { folders: 1024, items: 4096 } as const
const isPresetOf = (item: LibraryItem, assetId: string) => item.content.kind === 'preset' && item.content.assetId === assetId

/** The folder and every folder inside it, through `parentId`. Survives a cycle. */
const folderAndDescendants = (catalog: LibraryCatalog, id: string): Set<string> => {
  const ids = new Set<string>()
  const visit = (folder: string) => { if (ids.has(folder)) return; ids.add(folder); catalog.folders.filter(f => f.parentId === folder).forEach(f => visit(f.id)) }
  visit(id)
  return ids
}

/**
 * Moves an item or a folder into `folderId` (null: the top level). An item's presets go with it, so a sound and its
 * presets stay together. Moving a trashed entry restores it there, as one edit. Refuses a folder into itself or a folder
 * inside it, a destination that is trashed or gone, and a preset on its own (it goes where its sound goes).
 */
export const moveLibraryEntry = (catalog: LibraryCatalog, id: string, folderId: string | null): LibraryCatalog => {
  folderExists(catalog, folderId)
  const folder = catalog.folders.find(f => f.id === id)
  if (folder) {
    if (folderId !== null && folderAndDescendants(catalog, id).has(folderId)) throw new Error('A folder cannot go inside itself')
    const moved = { ...catalog, folders: catalog.folders.map(f => (f.id === id ? { ...f, parentId: folderId } : f)) }
    // Restoring after the move walks the destination's path, not the old one, so the old parents stay in the trash.
    return folder.trashed ? trashLibraryEntry(moved, id, false) : moved
  }
  const item = catalog.items.find(i => i.id === id)
  if (!item) throw new Error('That library entry is gone')
  if (item.content.kind === 'preset') throw new Error('A preset goes where its sound goes')
  // A live sound takes its live presets; a trashed one takes all of them, since restoring it restores them all.
  const carried = (i: LibraryItem) => i.id === id || (isPresetOf(i, id) && (item.trashed || !i.trashed))
  const moved = { ...catalog, items: catalog.items.map(i => (carried(i) ? { ...i, folderId } : i)) }
  return item.trashed ? trashLibraryEntry(moved, id, false) : moved
}

/** The ids `libraryItemDuplicate` gives the copy and its presets: the copy's first. */
const newItemId = () => createId('item')

/**
 * A copy of a live item into `folderId` (its own folder by default), with copies of its live presets pointing at it.
 * The copy is named "… copy" when it lands beside the original. Revisions and samples are shared: they are immutable.
 */
export const libraryItemDuplicate = (catalog: LibraryCatalog, itemId: string, folderId?: string | null, id = newItemId()): LibraryCatalog => {
  const item = catalog.items.find(i => i.id === itemId && !i.trashed)
  if (!item) throw new Error('That library item is gone')
  const destination = folderId === undefined ? item.folderId : folderId
  const presets = item.content.kind === 'preset' ? [] : catalog.items.filter(i => !i.trashed && isPresetOf(i, item.id))
  if (catalog.items.length + 1 + presets.length > LIMITS.items) throw new Error(`Library item limit reached (${LIMITS.items})`)
  let next = saveLibraryItem(catalog, { ...item, id, folderId: destination, name: destination === item.folderId ? `${item.name} copy` : item.name })
  for (const preset of presets) next = saveLibraryItem(next, { ...preset, id: newItemId(), folderId: destination, content: { ...preset.content, assetId: id } as LibraryItem['content'] })
  return next
}

/**
 * A deep copy of a live folder into `parentId`: new folder and item ids, presets pointing at their copied sound, and
 * revisions and sample references shared. Trashed contents stay behind. A preset follows its sound: one whose sound is
 * copied is copied beside it, wherever it was kept; one whose sound stays outside stays with it. Checks the folder and
 * item caps before copying anything. The copy is named "… copy" when it lands beside the original.
 */
export const duplicateLibraryFolder = (catalog: LibraryCatalog, id: string, parentId: string | null, newId = createId('folder')): LibraryCatalog => {
  const folder = catalog.folders.find(f => f.id === id && !f.trashed)
  if (!folder) throw new Error('That library folder is gone')
  folderExists(catalog, parentId)
  if (parentId !== null && folderAndDescendants(catalog, id).has(parentId)) throw new Error('A folder cannot go inside itself')
  const folders = catalog.folders.filter(f => !f.trashed && folderAndDescendants(catalog, id).has(f.id))
  const folderIds = new Map(folders.map(f => [f.id, f.id === id ? newId : createId('folder')]))
  const live = catalog.items.filter(i => !i.trashed)
  const soundIn = (i: LibraryItem) => i.content.kind === 'preset' ? live.find(s => s.id === (i.content as { assetId: string }).assetId) : undefined
  // The items the folder shows: its sounds and clips, and presets whose sound isn't live (they show as items there).
  const items = live.filter(i => i.folderId !== null && folderIds.has(i.folderId) && !soundIn(i))
  const itemIds = new Map(items.map(i => [i.id, createId('item')]))
  const presets = live.filter(i => { const sound = soundIn(i); return !!sound && itemIds.has(sound.id) })
  if (catalog.folders.length + folders.length > LIMITS.folders) throw new Error(`Library folder limit reached (${LIMITS.folders})`)
  if (catalog.items.length + items.length + presets.length > LIMITS.items) throw new Error(`Library item limit reached (${LIMITS.items})`)
  const copies: LibraryFolder[] = folders.map(f => ({
    id: folderIds.get(f.id)!,
    name: f.id === id && parentId === f.parentId ? libraryName(`${f.name} copy`) : f.name,
    parentId: f.id === id ? parentId : folderIds.get(f.parentId!)!,
  }))
  const itemCopies: LibraryItem[] = [
    ...items.map(i => ({ ...i, id: itemIds.get(i.id)!, folderId: folderIds.get(i.folderId!)! })),
    ...presets.map(p => {
      const sound = soundIn(p)!
      return { ...p, id: createId('item'), folderId: folderIds.get(sound.folderId!) ?? null, content: { ...p.content, assetId: itemIds.get(sound.id)! } as LibraryItem['content'] }
    }),
  ]
  return { ...catalog, folders: [...catalog.folders, ...copies], items: [...catalog.items, ...itemCopies] }
}
