import { create } from 'zustand'

/** What the arrangement's gestures snap to: a grid step, or nothing. */
export type TimelineGrid = 'bar' | 'beat' | '1/2' | '1/4' | '1/8' | '1/16' | 'off'

/** Each grid's step in beats, in the order the toolbar lists them; `off` has none. */
export const TIMELINE_GRIDS: readonly { readonly grid: TimelineGrid; readonly title: string; readonly beats: number | null }[] = [
  { grid: 'bar', title: 'Bar', beats: 4 },
  { grid: 'beat', title: 'Beat', beats: 1 },
  { grid: '1/2', title: '1/2', beats: 0.5 },
  { grid: '1/4', title: '1/4', beats: 0.25 },
  { grid: '1/8', title: '1/8', beats: 0.125 },
  { grid: '1/16', title: '1/16', beats: 0.0625 },
  { grid: 'off', title: 'Off', beats: null },
]

export const isTimelineGrid = (value: unknown): value is TimelineGrid => TIMELINE_GRIDS.some((entry) => entry.grid === value)

/** A grid's step in beats; null with the grid off. */
export const gridBeats = (grid: TimelineGrid): number | null => TIMELINE_GRIDS.find((entry) => entry.grid === grid)?.beats ?? null

/** The zoom's bounds, in pixels per beat. Zooming out also stops where the whole timeline fits. */
export const ARRANGEMENT_ZOOM = { min: 0.05, max: 256 } as const

/** The header column's width, in pixels. */
export const HEADER_WIDTH = { min: 120, max: 320, initial: 180 } as const

const clampZoom = (pxPerBeat: number) => Math.min(ARRANGEMENT_ZOOM.max, Math.max(ARRANGEMENT_ZOOM.min, pxPerBeat))
const clampHeader = (width: number) => Math.round(Math.min(HEADER_WIDTH.max, Math.max(HEADER_WIDTH.min, width)))

/** A zoom the view applies once it knows its width: the whole timeline, or a range of beats. */
export type TimelineZoom = 'fit' | { readonly from: number; readonly to: number }

/** The arrangement's view settings kept per browser. */
export interface ArrangementViewSettings {
  readonly pxPerBeat: number
  readonly grid: TimelineGrid
  /** The view scrolls to keep the playhead in sight. */
  readonly follow: boolean
  readonly headerWidth: number
}

export const DEFAULT_ARRANGEMENT_VIEW: ArrangementViewSettings = { pxPerBeat: 24, grid: '1/4', follow: true, headerWidth: HEADER_WIDTH.initial }

interface ArrangementViewState extends ArrangementViewSettings {
  /** Where arrangement playback starts, in beats; ■ returns here. Not saved. */
  readonly position: number
  /** False once the user scrolled during this playback: follow waits for the next ▶. */
  readonly following: boolean
  readonly zoomTo: TimelineZoom | null
  setZoom(pxPerBeat: number): void
  setGrid(grid: TimelineGrid): void
  setFollow(follow: boolean): void
  setHeaderWidth(width: number): void
  setPosition(beat: number): void
  suspendFollow(): void
  resumeFollow(): void
  /** Asks the view for a zoom; it takes it (`takeZoom`) once it knows its width. */
  zoom(to: TimelineZoom): void
  takeZoom(): TimelineZoom | null
  /** Takes what was saved, keeping each field only when it is valid. */
  restore(saved: { readonly [K in keyof ArrangementViewSettings]?: unknown }): void
}

/**
 * The arrangement's view: its zoom, grid, follow and header width (per browser, through `ui`'s storage hook) and its
 * position (in memory). Not in the project and not undone.
 */
export const useArrangementView = create<ArrangementViewState>((set, get) => ({
  ...DEFAULT_ARRANGEMENT_VIEW,
  position: 0,
  following: true,
  zoomTo: null,
  setZoom: (pxPerBeat) => set({ pxPerBeat: clampZoom(pxPerBeat) }),
  setGrid: (grid) => set({ grid }),
  setFollow: (follow) => set({ follow, following: true }),
  setHeaderWidth: (width) => set({ headerWidth: clampHeader(width) }),
  setPosition: (beat) => set({ position: Math.max(0, beat) }),
  suspendFollow: () => {
    if (get().following) set({ following: false })
  },
  resumeFollow: () => {
    if (!get().following) set({ following: true })
  },
  zoom: (to) => set({ zoomTo: to }),
  takeZoom: () => {
    const to = get().zoomTo
    if (to) set({ zoomTo: null })
    return to
  },
  restore: (saved) =>
    set({
      ...(typeof saved.pxPerBeat === 'number' && Number.isFinite(saved.pxPerBeat) && { pxPerBeat: clampZoom(saved.pxPerBeat) }),
      ...(isTimelineGrid(saved.grid) && { grid: saved.grid }),
      ...(typeof saved.follow === 'boolean' && { follow: saved.follow }),
      ...(typeof saved.headerWidth === 'number' && Number.isFinite(saved.headerWidth) && { headerWidth: clampHeader(saved.headerWidth) }),
    }),
}))
