import { type FactoryLibrary, type LibraryBundleSelection, type LibraryCatalog, emptyLibrary, isFactoryId } from '@core'
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
  /** The read-only Factory catalog, once loaded (`loadFactory`); null until then. */
  readonly factory: LibraryCatalog | null
  /** A line per Factory item, by id, for the details. */
  readonly factoryNotes: Readonly<Record<string, string>>
  /**
   * The row the details show and the tree focuses. A new value from outside the tree (`reveal`) makes the tree expand
   * the rows above it. Null shows *My library*.
   */
  readonly active: LibraryRowRef | null
  /**
   * The My library folder open when a Factory row became active (null: the top level), so a copy or a save made while
   * the Factory is open goes there.
   */
  readonly mineFolder: string | null
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
  factory: null,
  factoryNotes: {},
  active: null,
  mineFolder: null,
  selected: [],
  previewing: null,
  request: null,
  projectExpanded: { epoch: -1, keys: new Set() },
  setCatalog: (catalog) => set({ catalog }),
  // A row of My library (or a root) sets the folder a Factory copy goes to; a Factory row keeps it.
  setActive: (active) => set((state) => (inFactory(active) ? { active } : { active, mineFolder: openFolderOf({ ...state, active }) })),
  select: (selected) => set({ selected }),
  setPreviewing: (previewing) => set({ previewing }),
  setRequest: (request) => set({ request }),
  setProjectExpanded: (keys) => set({ projectExpanded: { epoch: useProjectStore.getState().documentEpoch, keys } }),
  reveal: (itemId) => {
    const active: LibraryRowRef = { kind: 'item', id: itemId }
    set((state) => (inFactory(active) ? { active, selected: [itemId] } : { active, selected: [itemId], mineFolder: openFolderOf({ ...state, active }) }))
    useLayoutStore.getState().revealView('library')
  },
}))

const NONE: ReadonlySet<string> = new Set()

/** What is open under *This project* for the project loaded at `epoch`: nothing, for a project loaded since. */
export const projectExpandedOf = ({ projectExpanded }: Pick<LibraryViewState, 'projectExpanded'>, epoch: number): ReadonlySet<string> =>
  projectExpanded.epoch === epoch ? projectExpanded.keys : NONE

/** Whether a row is the Factory's: its root, or a folder or item of it. */
const inFactory = (active: LibraryRowRef | null): boolean => !!active && (active.kind === 'root' ? active.id === 'factory' : (active.kind === 'folder' || active.kind === 'item') && isFactoryId(active.id))

/**
 * The folder open in My library, where new things are saved and Factory things copied: the active folder, or the folder
 * of the active item (its sound's, for a preset); while a Factory row is active, the one open before (`mineFolder`).
 * Null, the top level, for a root, or anything trashed or gone.
 */
export const openFolderOf = ({ catalog, active, mineFolder = null }: Pick<LibraryViewState, 'catalog' | 'active'> & { readonly mineFolder?: string | null }): string | null => {
  const live = (id: string | null) => (id !== null && catalog.folders.some((folder) => folder.id === id && !folder.trashed) ? id : null)
  if (inFactory(active)) return live(mineFolder)
  if (active?.kind === 'folder') return live(active.id)
  if (active?.kind !== 'item') return null
  const item = catalog.items.find((candidate) => candidate.id === active.id && !candidate.trashed)
  if (!item) return null
  const sound = item.content.kind === 'preset' ? catalog.items.find((candidate) => !candidate.trashed && candidate.id === (item.content as { assetId: string }).assetId) : undefined
  return live((sound ?? item).folderId)
}

/** The folder open in the Library now. */
export const openFolder = (): string | null => openFolderOf(useLibraryStore.getState())

const EMPTY = emptyLibrary()

/** The catalog an id lives in: the Factory's for a `factory:` id (empty until it has loaded), the personal one otherwise. */
export const catalogOf = (id: string, state: Pick<LibraryViewState, 'catalog' | 'factory'> = useLibraryStore.getState()): LibraryCatalog =>
  isFactoryId(id) ? (state.factory ?? EMPTY) : state.catalog

/** The catalog to insert or preview an item from, when it isn't storage's: the Factory's, for a Factory item. */
export const fromOf = (id: string): LibraryCatalog | undefined => (isFactoryId(id) ? (useLibraryStore.getState().factory ?? undefined) : undefined)

let loadingFactory: Promise<LibraryCatalog> | undefined

/**
 * Loads the Factory into the store once (its code is a lazy chunk, and the catalog is built from the examples on the
 * way); later calls get the same promise. A failure lets the next call try again.
 */
export const loadFactory = (load: () => Promise<FactoryLibrary>): Promise<LibraryCatalog> => {
  const known = useLibraryStore.getState().factory
  if (known) return Promise.resolve(known)
  loadingFactory ??= load().then(
    ({ catalog, notes }) => {
      useLibraryStore.setState({ factory: catalog, factoryNotes: notes })
      return catalog
    },
    (error: unknown) => {
      loadingFactory = undefined
      throw error
    },
  )
  return loadingFactory
}

