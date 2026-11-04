import { type LibraryCatalog, emptyLibrary } from '@core'
import { create } from 'zustand'
import { useLayoutStore } from './layout-store'

/** A row of the Library's tree: a root (`mine` or `trash`), a folder or an item, by id. */
export interface LibraryRowRef {
  readonly kind: 'root' | 'folder' | 'item'
  readonly id: string
}

interface LibraryViewState {
  /** The catalog as last read or written; the Library view and the library's actions both keep it current. */
  readonly catalog: LibraryCatalog
  /** The folder the Library view shows; null is the root. */
  readonly openFolder: string | null
  /**
   * The row the details show and the tree focuses. A new value from outside the tree (`reveal`) makes the tree expand
   * the rows above it.
   */
  readonly active: LibraryRowRef | null
  setCatalog(catalog: LibraryCatalog): void
  open(folderId: string | null): void
  /** Shows an item in the Library: makes it active, so the tree expands its path, and shows the view. */
  reveal(itemId: string): void
}

/** The personal library as the UI sees it. The library itself lives in storage, behind `PersonalLibrary`. */
export const useLibraryStore = create<LibraryViewState>((set, get) => ({
  catalog: emptyLibrary(),
  openFolder: null,
  active: null,
  setCatalog: (catalog) => set({ catalog }),
  open: (openFolder) => set({ openFolder }),
  reveal: (itemId) => {
    const item = get().catalog.items.find((candidate) => candidate.id === itemId)
    set({ active: { kind: 'item', id: itemId }, ...(item && !item.trashed && { openFolder: item.folderId }) })
    useLayoutStore.getState().revealView('library')
  },
}))
