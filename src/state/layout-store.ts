import { create } from 'zustand'

/** Every view the workbench can show. The ids are stable: layouts are saved by them. */
export type ViewId =
  | 'session' | 'arrangement' | 'wave'
  | 'instrument' | 'effects' | 'notes' | 'clip' | 'mixer' | 'samples' | 'sounds' | 'library'

/** Where a view can sit: the editor area in the middle, the panel below it, and a sidebar on either side. */
export type RegionId = 'editor' | 'panel' | 'primary' | 'secondary'

/** A tab group, as the store mirrors it. A region can hold several (the editor area splits). */
export interface GroupState {
  readonly id: string
  readonly region: RegionId
  readonly views: readonly ViewId[]
  readonly active: ViewId
}

/** What the store mirrors of the layout, which the shell owns. */
export interface LayoutSnapshot {
  readonly groups: readonly GroupState[]
  /** The views showing now: the active view of each group in a region that isn't hidden. */
  readonly visible: readonly ViewId[]
  readonly hiddenRegions: readonly RegionId[]
}

/** Implemented by the shell. `state` cannot import `ui`, so the shell registers itself with `attachDriver`. */
export interface LayoutDriver {
  /** Select the view's tab, showing its region first if that is hidden. */
  reveal(id: ViewId): void
  setRegionVisible(region: RegionId, visible: boolean): void
  /** Replace the layout with the default one. */
  reset(): void
  /** Replace the layout with the one saved under this name. */
  load(name: string): void
  /** Save the layout under this name, replacing one of the same name. */
  saveAs(name: string): void
}

interface LayoutState extends LayoutSnapshot {
  /** Make a view visible, wherever it is docked. */
  revealView(id: ViewId): void
  /** The Tab key and the transport's Session | Arrangement buttons: show whichever of the two isn't showing. */
  toggleMainView(): void
  /** Hide or show the panel or a sidebar. The editor area is always shown. */
  toggleRegion(region: RegionId): void
  resetLayout(): void
  /** Replace the layout with one saved under a name (per browser, with `saveLayoutAs`). */
  loadLayout(name: string): void
  /** Save the layout under a name, replacing one of the same name. */
  saveLayoutAs(name: string): void
  /** Shell only. Returns the detach function. */
  attachDriver(driver: LayoutDriver): () => void
  /** Shell only: mirror the layout after each change to it. */
  sync(snapshot: LayoutSnapshot): void
}

/** The views the Tab key toggles between. */
export const MAIN_VIEWS: readonly ViewId[] = ['session', 'arrangement']
const PANEL_VIEWS: readonly ViewId[] = ['instrument', 'effects', 'notes', 'clip', 'mixer', 'samples', 'library']

const visibleOf = (groups: readonly GroupState[], hiddenRegions: readonly RegionId[]): readonly ViewId[] =>
  groups.filter((group) => !hiddenRegions.includes(group.region)).map((group) => group.active)

const DEFAULT_GROUPS: readonly GroupState[] = [
  { id: 'editor', region: 'editor', views: [...MAIN_VIEWS, 'wave'], active: 'session' },
  { id: 'panel', region: 'panel', views: PANEL_VIEWS, active: 'instrument' },
  { id: 'border_right', region: 'secondary', views: ['sounds'], active: 'sounds' },
]
const DEFAULT_HIDDEN: readonly RegionId[] = ['primary', 'secondary']

/**
 * The default layout: Session, Arrangement and the wave editor over the tool views in the panel; Sounds in the
 * secondary sidebar, collapsed to its strip; the primary sidebar empty and hidden.
 */
export const DEFAULT_LAYOUT: LayoutSnapshot = {
  groups: DEFAULT_GROUPS,
  visible: visibleOf(DEFAULT_GROUPS, DEFAULT_HIDDEN),
  hiddenRegions: DEFAULT_HIDDEN,
}

const sameList = <T>(a: readonly T[], b: readonly T[]): boolean => a.length === b.length && a.every((item, index) => item === b[index])
const sameGroups = (a: readonly GroupState[], b: readonly GroupState[]): boolean =>
  a.length === b.length && a.every((group, index) => {
    const other = b[index]!
    return group.id === other.id && group.region === other.region && group.active === other.active && sameList(group.views, other.views)
  })

let driver: LayoutDriver | undefined

/**
 * Which view shows where. Pure UI state, separate from what is selected. The shell owns the layout tree: with a
 * driver attached, the actions go to it and the shell mirrors the result back through `sync`. Without one (unit
 * tests, or before the shell mounts) the actions update the mirror directly.
 */
export const useLayoutStore = create<LayoutState>((set, get) => ({
  ...DEFAULT_LAYOUT,
  revealView: (id) => {
    if (driver) return driver.reveal(id)
    set((state) => {
      const group = state.groups.find((candidate) => candidate.views.includes(id))
      if (!group || (group.active === id && !state.hiddenRegions.includes(group.region))) return state
      const groups = state.groups.map((candidate) => (candidate === group ? { ...group, active: id } : candidate))
      const hiddenRegions = state.hiddenRegions.filter((region) => region !== group.region)
      return { groups, hiddenRegions, visible: visibleOf(groups, hiddenRegions) }
    })
  },
  toggleMainView: () => {
    const shown = MAIN_VIEWS.filter((id) => get().visible.includes(id))
    if (shown.length === MAIN_VIEWS.length) return
    get().revealView(MAIN_VIEWS.find((id) => !shown.includes(id)) ?? 'session')
  },
  toggleRegion: (region) => {
    if (region === 'editor') return
    const visible = get().hiddenRegions.includes(region)
    if (driver) return driver.setRegionVisible(region, visible)
    set((state) => {
      const hiddenRegions = visible ? state.hiddenRegions.filter((candidate) => candidate !== region) : [...state.hiddenRegions, region]
      return { hiddenRegions, visible: visibleOf(state.groups, hiddenRegions) }
    })
  },
  resetLayout: () => {
    if (driver) return driver.reset()
    set(DEFAULT_LAYOUT)
  },
  // Named layouts live with the shell's model; without a driver there is nothing to save or load.
  loadLayout: (name) => driver?.load(name),
  saveLayoutAs: (name) => driver?.saveAs(name),
  attachDriver: (next) => {
    driver = next
    return () => {
      if (driver === next) driver = undefined
    }
  },
  // The shell syncs after every model change, splitter drags included; an unchanged mirror keeps its references so
  // subscribers don't re-render.
  sync: (snapshot) => set((state) => ({
    groups: sameGroups(state.groups, snapshot.groups) ? state.groups : snapshot.groups,
    visible: sameList(state.visible, snapshot.visible) ? state.visible : snapshot.visible,
    hiddenRegions: sameList(state.hiddenRegions, snapshot.hiddenRegions) ? state.hiddenRegions : snapshot.hiddenRegions,
  })),
}))

/** The first group in a region, for code that shows one group per region. */
export const groupIn = (state: LayoutSnapshot, region: RegionId): GroupState | undefined =>
  state.groups.find((group) => group.region === region)
