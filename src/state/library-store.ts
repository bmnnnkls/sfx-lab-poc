import { type LibraryBundleSelection, type LibraryCatalog, emptyLibrary } from '@core'
import { create } from 'zustand'
import { useLayoutStore } from './layout-store'
import { useProjectStore } from './project-store'

/**
 * A row of the Library's tree: a root (`project`, `mine` or `trash`), a folder or an item, by id; or a row of *This
 * project* (`project`), by its row key.
 */
export interface LibraryRowRef {
  readonly kind: 'root' | 'folder' | 'item' | 'project'
  readonly id: string
}

/** The expanded rows of *This project*, for the project loaded when they were set (its `documentEpoch`). */
export interface ProjectExpansion {
  readonly epoch: number
  readonly keys: ReadonlySet<string>
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
  /** What is open under *This project*. Loading another project starts it collapsed again (`projectExpandedOf`). */
  readonly projectExpanded: ProjectExpansion
  setCatalog(catalog: LibraryCatalog): void
  setActive(active: LibraryRowRef | null): void
  select(selected: readonly string[]): void
  setPreviewing(itemId: string | null): void
  setRequest(request: LibraryRequest | null): void
  /** Sets what is open under *This project*, for the project loaded now. */
  setProjectExpanded(keys: ReadonlySet<string>): void
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
  projectExpanded: { epoch: -1, keys: new Set() },
  setCatalog: (catalog) => set({ catalog }),
  setActive: (active) => set({ active }),
  select: (selected) => set({ selected }),
  setPreviewing: (previewing) => set({ previewing }),
  setRequest: (request) => set({ request }),
  setProjectExpanded: (keys) => set({ projectExpanded: { epoch: useProjectStore.getState().documentEpoch, keys } }),
  reveal: (itemId) => {
    set({ active: { kind: 'item', id: itemId }, selected: [itemId] })
    useLayoutStore.getState().revealView('library')
  },
}))

const NONE: ReadonlySet<string> = new Set()

/** What is open under *This project* for the project loaded at `epoch`: nothing, for a project loaded since. */
export const projectExpandedOf = ({ projectExpanded }: Pick<LibraryViewState, 'projectExpanded'>, epoch: number): ReadonlySet<string> =>
  projectExpanded.epoch === epoch ? projectExpanded.keys : NONE

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
