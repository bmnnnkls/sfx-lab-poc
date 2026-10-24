import { type LibraryCatalog, emptyLibrary } from '@core'
import { create } from 'zustand'

interface LibraryViewState {
  /** The catalog as last read or written; the Library view and the library's actions both keep it current. */
  readonly catalog: LibraryCatalog
  /** The folder the Library view shows; null is the root. */
  readonly openFolder: string | null
  setCatalog(catalog: LibraryCatalog): void
  open(folderId: string | null): void
}

/** The personal library as the UI sees it. The library itself lives in storage, behind `PersonalLibrary`. */
export const useLibraryStore = create<LibraryViewState>((set) => ({
  catalog: emptyLibrary(),
  openFolder: null,
  setCatalog: (catalog) => set({ catalog }),
  open: (openFolder) => set({ openFolder }),
}))
