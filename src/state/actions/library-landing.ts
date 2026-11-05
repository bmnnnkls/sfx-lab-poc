import { type LibraryCatalog, duplicateLibraryFolder, isFactoryId, libraryItemDuplicate, moveLibraryEntry, trashLibraryEntry } from '@core'
import { openFolder, useLibraryStore } from '../library-store'
import { copyToMine, editLibrary, moveOffTrash } from './library'
import type { ActionContext, ActionReport, SubjectOf } from './types'

/** An item or folder of My library or the Factory, as it is dragged. */
export type LibraryEntry = SubjectOf<'library-item' | 'library-folder'>

/** Where library things land: a folder, *My library* or the trash. */
export type LibraryPlace = SubjectOf<'library-folder' | 'library-root'>

/** How they land: moved (a drag, a cut's paste) or copied (an Alt-drag, a copy's paste). The Factory's always copy. */
export type LandingMode = 'move' | 'copy'

/** What landing several things does: one edit of My library, and the Factory things to copy in after it. */
interface Landing {
  readonly edit: (catalog: LibraryCatalog) => LibraryCatalog
  readonly factory: readonly string[]
  readonly moved: number
  readonly restored: number
  readonly copied: number
  readonly trashed: number
}

const idOf = (entry: LibraryEntry): string => (entry.kind === 'library-item' ? entry.itemId : entry.folderId)

/** Whether `folderId` is `ancestor` or inside it. */
const isWithin = (catalog: LibraryCatalog, folderId: string, ancestor: string): boolean => {
  for (let id: string | null = folderId, seen = 0; id !== null && seen <= catalog.folders.length; seen++) {
    if (id === ancestor) return true
    id = catalog.folders.find((folder) => folder.id === id)?.parentId ?? null
  }
  return false
}

/**
 * The entries that land: each once, and without the presets whose sound lands too (a preset goes where its sound
 * goes, so a selection running over a sound and its presets moves the sound).
 */
const landingEntries = (catalog: LibraryCatalog, entries: readonly LibraryEntry[]): readonly LibraryEntry[] => {
  const ids = new Set(entries.map(idOf))
  const seen = new Set<string>()
  return entries.filter((entry) => {
    const id = idOf(entry)
    if (seen.has(id)) return false
    seen.add(id)
    const content = entry.kind === 'library-item' ? catalog.items.find((item) => item.id === id)?.content : undefined
    return !(content?.kind === 'preset' && ids.has(content.assetId))
  })
}

/**
 * How `entries` land on `place`, applying the rule for one dragged thing to each, or undefined when any is refused (so
 * the whole lands or none of it). Onto a live folder or *My library*: My library's move there (restoring a trashed one)
 * or copy, never into themselves, and a move refuses where it already is; a preset only goes to the trash; the
 * Factory's are copied in. Onto the trash: My library's live ones are trashed.
 */
export const libraryLanding = (entries: readonly LibraryEntry[], place: LibraryPlace, mode: LandingMode, state = useLibraryStore.getState()): Landing | undefined => {
  const { catalog, factory } = state
  const landing = landingEntries(catalog, entries)
  if (landing.length === 0) return undefined
  const counts = { moved: 0, restored: 0, copied: 0, trashed: 0 }
  const edits: ((value: LibraryCatalog) => LibraryCatalog)[] = []
  const factoryIds: string[] = []
  const toTrash = place.kind === 'library-root' && place.root === 'trash'
  const destination = place.kind === 'library-folder' ? place.folderId : null
  if (!toTrash) {
    if (place.kind === 'library-root' && place.root !== 'mine') return undefined
    if (destination !== null && !catalog.folders.some((folder) => folder.id === destination && !folder.trashed)) return undefined
  }
  for (const entry of landing) {
    const id = idOf(entry)
    if (isFactoryId(id)) {
      const known = entry.kind === 'library-item' ? factory?.items.some((item) => item.id === id) : factory?.folders.some((folder) => folder.id === id)
      if (toTrash || !known) return undefined
      factoryIds.push(id)
      counts.copied++
      continue
    }
    const found = entry.kind === 'library-item' ? catalog.items.find((item) => item.id === id) : catalog.folders.find((folder) => folder.id === id)
    if (!found) return undefined
    if (toTrash) {
      if (found.trashed) return undefined
      edits.push((value) => trashLibraryEntry(value, id))
      counts.trashed++
      continue
    }
    const parent = 'parentId' in found ? found.parentId : found.folderId
    if (entry.kind === 'library-item' && 'content' in found && found.content.kind === 'preset') return undefined
    if (entry.kind === 'library-folder' && destination !== null && isWithin(catalog, destination, id)) return undefined
    if (found.trashed) {
      // A trashed thing is restored where it lands, as a drag restores it; a copy of it isn't offered.
      if (mode === 'copy') return undefined
      edits.push((value) => moveLibraryEntry(value, id, destination))
      counts.restored++
    } else if (mode === 'copy') {
      edits.push((value) => (entry.kind === 'library-item' ? libraryItemDuplicate(value, id, destination) : duplicateLibraryFolder(value, id, destination)))
      counts.copied++
    } else {
      if (parent === destination) return undefined
      edits.push((value) => moveLibraryEntry(value, id, destination))
      counts.moved++
    }
  }
  return { edit: (value) => edits.reduce((next, edit) => edit(next), value), factory: factoryIds, ...counts }
}

/** "Kick", or "3 things". */
const what = (count: number, name: string | undefined) => (count === 1 && name ? name : `${count} thing${count === 1 ? '' : 's'}`)

/**
 * Lands `entries` on `place` (see `libraryLanding`) in one catalog update, and reports what it did: "Moved Kick to
 * Drums", "Copied 3 things to My library", "Moved 2 things to the trash". Factory copies have the copy's *Show*.
 */
export const landLibraryEntries = async (entries: readonly LibraryEntry[], place: LibraryPlace, mode: LandingMode, context: ActionContext): Promise<string | ActionReport> => {
  const state = useLibraryStore.getState()
  const landing = libraryLanding(entries, place, mode, state)
  if (!landing) throw new Error('Those can’t go there')
  const first = entries[0] ? idOf(entries[0]) : ''
  const entryName = (id: string) => [...state.catalog.items, ...state.catalog.folders, ...(state.factory?.items ?? []), ...(state.factory?.folders ?? [])].find((entry) => entry.id === id)?.name
  const toTrash = place.kind === 'library-root' && place.root === 'trash'
  const destination = place.kind === 'library-folder' ? place.folderId : null
  const where = toTrash ? 'the trash' : destination === null ? 'My library' : (state.catalog.folders.find((folder) => folder.id === destination)?.name ?? 'My library')
  const parts = ([['Moved', landing.moved + landing.trashed], ['Restored', landing.restored], ['Copied', landing.copied]] as const).filter(([, count]) => count > 0)
  const total = parts.reduce((sum, [, count]) => sum + count, 0)
  const message =
    parts.length === 1 ? `${parts[0]![0]} ${what(total, entryName(first))} to ${where}` : `${parts.map(([verb, count], index) => `${index === 0 ? verb : verb.toLowerCase()} ${count}`).join(', ')} to ${where}`
  if (landing.factory.length > 0) return copyToMine(landing.factory, destination, context, { edit: landing.edit, message })
  if (!toTrash) return editLibrary(context, landing.edit, message)
  // As *Trash*: the preview stops, and the Library moves on from a trashed active row.
  context.library.stopPreview()
  const folderId = openFolder()
  const reported = await editLibrary(context, landing.edit, message)
  moveOffTrash(folderId)
  return reported
}
