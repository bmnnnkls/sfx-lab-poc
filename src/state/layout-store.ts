import { create } from 'zustand'

/** Every view the workbench can show. The ids are stable: layouts are saved by them. */
export type ViewId =
  | 'session' | 'arrangement'
  | 'instrument' | 'effects' | 'notes' | 'clip' | 'mixer' | 'samples' | 'sounds' | 'library'

/** Where a view can sit. Round 1 has the two regions that exist today; round 2 adds sidebars. */
export type RegionId = 'main' | 'panel'

/** An ordered group of views with one of them showing: the shape of a tab group. */
export interface RegionState {
  readonly views: readonly ViewId[]
  readonly active: ViewId
}

interface LayoutState {
  readonly regions: Readonly<Record<RegionId, RegionState>>
  /** Make a view visible: activate it in the region that holds it. */
  revealView(id: ViewId): void
  /** The Tab key / transport toggle between the main region's views. */
  toggleMainView(): void
  /** Put the bottom panel back on its default view (used when a project is replaced). */
  resetPanel(): void
}

const PANEL_VIEWS: readonly ViewId[] = ['instrument', 'effects', 'notes', 'clip', 'mixer', 'samples', 'sounds', 'library']

export const DEFAULT_REGIONS: Readonly<Record<RegionId, RegionState>> = {
  main: { views: ['session', 'arrangement'], active: 'session' },
  panel: { views: PANEL_VIEWS, active: 'instrument' },
}

const regionOf = (regions: Readonly<Record<RegionId, RegionState>>, id: ViewId): RegionId | undefined =>
  (Object.keys(regions) as RegionId[]).find((region) => regions[region].views.includes(id))

/** Which view shows where. Pure UI state, separate from what is selected. */
export const useLayoutStore = create<LayoutState>((set) => ({
  regions: DEFAULT_REGIONS,
  revealView: (id) => set((state) => {
    const region = regionOf(state.regions, id)
    if (!region || state.regions[region].active === id) return state
    return { regions: { ...state.regions, [region]: { ...state.regions[region], active: id } } }
  }),
  toggleMainView: () => set((state) => {
    const { views, active } = state.regions.main
    const next = views[(views.indexOf(active) + 1) % views.length] ?? active
    return { regions: { ...state.regions, main: { ...state.regions.main, active: next } } }
  }),
  resetPanel: () => set((state) => ({ regions: { ...state.regions, panel: { ...state.regions.panel, active: DEFAULT_REGIONS.panel.active } } })),
}))
