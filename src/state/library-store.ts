import { type LibraryBundleSelection, type LibraryCatalog, emptyLibrary } from '@core'
import { create } from 'zustand'
import { useLayoutStore } from './layout-store'

/** A row of the Library's tree: a root (`mine` or `trash`), a folder or an item, by id. */
export interface LibraryRowRef {
  readonly kind: 'root' | 'folder' | 'item'
  readonly id: string
}

/**
 * What a menu asked the Library view to do, which only the view can: open the bundle review for an export, or the
 * file picker for an import. The view clears it once it has.
 */
export type LibraryRequest = { readonly kind: 'export'; readonly selection: LibraryBundleSelection; readonly name: string } | { readonly kind: 'import' }

interface LibraryViewState {
  /** The catalog as last read or written; the Library view and the library's actions both keep it current. */
  readonly catalog: LibraryCatalog
  /**
   * The row the details show and the tree focuses. A new value from outside the tree (`reveal`) makes the tree expand
   * the rows above it. Null shows *My library*.
   */
  readonly active: LibraryRowRef | null
  /** The selected items, for *Export selection…*. */
  readonly selected: readonly string[]
  /** The item being previewed, whose row shows ■. */
  readonly previewing: string | null
  readonly request: LibraryRequest | null
  setCatalog(catalog: LibraryCatalog): void
  setActive(active: LibraryRowRef | null): void
  select(selected: readonly string[]): void
  setPreviewing(itemId: string | null): void
  setRequest(request: LibraryRequest | null): void
  /** Shows an item in the Library: makes it active, so the tree expands its path, and shows the view. */
  reveal(itemId: string): void
}

/** The personal library as the UI sees it. The library itself lives in storage, behind `PersonalLibrary`. */
export const useLibraryStore = create<LibraryViewState>((set) => ({
  catalog: emptyLibrary(),
  active: null,
  selected: [],
  previewing: null,
  request: null,
  setCatalog: (catalog) => set({ catalog }),
  setActive: (active) => set({ active }),
  select: (selected) => set({ selected }),
  setPreviewing: (previewing) => set({ previewing }),
  setRequest: (request) => set({ request }),
  reveal: (itemId) => {
    set({ active: { kind: 'item', id: itemId }, selected: [itemId] })
    useLayoutStore.getState().revealView('library')
  },
}))

/**
 * The folder open in the Library, where new things are saved: the active folder, or the folder of the active item
 * (its sound's, for a preset). Null, the top level, for a root, or anything trashed or gone.
 */
export const openFolderOf = ({ catalog, active }: Pick<LibraryViewState, 'catalog' | 'active'>): string | null => {
  const live = (id: string | null) => (id !== null && catalog.folders.some((folder) => folder.id === id && !folder.trashed) ? id : null)
  if (active?.kind === 'folder') return live(active.id)
  if (active?.kind !== 'item') return null
  const item = catalog.items.find((candidate) => candidate.id === active.id && !candidate.trashed)
  if (!item) return null
  const sound = item.content.kind === 'preset' ? catalog.items.find((candidate) => !candidate.trashed && candidate.id === (item.content as { assetId: string }).assetId) : undefined
  return live((sound ?? item).folderId)
}

/** The folder open in the Library now. */
export const openFolder = (): string | null => openFolderOf(useLibraryStore.getState())
