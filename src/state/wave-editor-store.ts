import type { FrameRange, SampleEditKind } from '@core'
import { create } from 'zustand'

/** Which channels a selection covers. On a mono sample it is always `both`. */
export type WaveChannels = 'both' | 'left' | 'right'

/** A selection in frames, from `from` up to (not including) `to`, `from < to`. */
export interface WaveSelection {
  readonly from: number
  readonly to: number
  readonly channels: WaveChannels
}

/** A zoom the editor is asked for: frames `from` to `to` across the width, or the whole sample. */
export type WaveZoom = FrameRange | 'fit'

/** How one sample is looked at in the Wave editor. */
export interface WaveEditorView {
  /** Frames per pixel column, or null to fit the whole sample in the width (what a sample opens with). */
  readonly framesPerPixel: number | null
  /** The frame at the left edge. */
  readonly startFrame: number
  /** Where ▶ plays from without a selection. */
  readonly cursor: number
  readonly selection: WaveSelection | null
  /**
   * Set by `zoom` and `reveal`: the editor zooms there once it knows its width and has the audio (`takeZoom`). Buttons,
   * menu entries, keys and entry points all ask this way, since only the editor knows its width.
   */
  readonly zoomTo?: WaveZoom
  /** The edit whose settings popover is open under the toolbar (from a button, a menu entry or the palette). */
  readonly asking?: SampleEditKind | null
}

export const DEFAULT_WAVE_VIEW: WaveEditorView = { framesPerPixel: null, startFrame: 0, cursor: 0, selection: null }

interface WaveEditorState {
  /** By the sample's origin (`originOf`), so a view follows its sample through edits, undo and redo. */
  readonly views: Readonly<Record<string, WaveEditorView>>
  setView(key: string, change: Partial<WaveEditorView>): void
  /** Sets the selection: ordered, and none when it is empty. */
  select(key: string, selection: WaveSelection | null): void
  /** Selects a part of a sample and asks the editor to zoom to it, once (an entry point opening a clip's trim). */
  reveal(key: string, selection: WaveSelection): void
  /** Asks the editor to zoom to a range, or to fit the whole sample. */
  zoom(key: string, zoom: WaveZoom): void
  /** The zoom asked for, cleared as it is read, so it is done once. */
  takeZoom(key: string): WaveZoom | undefined
  /** Opens an edit's settings popover, or closes it (null). */
  ask(key: string, kind: SampleEditKind | null): void
}

/**
 * The Wave editor's view of each sample, in memory: zoom, scroll, cursor and selection, so they survive tab switches and
 * switching samples until reload. Not saved with the project and not undone.
 */
export const useWaveEditorStore = create<WaveEditorState>((set, get) => ({
  views: {},
  setView: (sampleId, change) =>
    set((state) => ({ views: { ...state.views, [sampleId]: { ...(state.views[sampleId] ?? DEFAULT_WAVE_VIEW), ...change } } })),
  select: (sampleId, selection) =>
    set((state) => {
      const ordered = selection && {
        ...selection,
        from: Math.min(selection.from, selection.to),
        to: Math.max(selection.from, selection.to),
      }
      const kept = ordered && ordered.to > ordered.from ? ordered : null
      return { views: { ...state.views, [sampleId]: { ...(state.views[sampleId] ?? DEFAULT_WAVE_VIEW), selection: kept } } }
    }),
  reveal: (key, selection) => {
    get().select(key, selection)
    const from = Math.min(selection.from, selection.to)
    get().setView(key, { cursor: from, zoomTo: { from, to: Math.max(selection.from, selection.to) } })
  },
  zoom: (key, zoom) => get().setView(key, { zoomTo: zoom }),
  takeZoom: (key) => {
    const zoom = get().views[key]?.zoomTo
    if (zoom !== undefined) get().setView(key, { zoomTo: undefined })
    return zoom
  },
  ask: (key, kind) => get().setView(key, { asking: kind }),
}))

/** One sample's view, by its origin, or the default for a sample not looked at yet. */
export const waveViewOf = (views: Readonly<Record<string, WaveEditorView>>, key: string): WaveEditorView =>
  views[key] ?? DEFAULT_WAVE_VIEW
