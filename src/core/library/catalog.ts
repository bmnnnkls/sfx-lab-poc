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
