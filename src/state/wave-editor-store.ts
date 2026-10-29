import { create } from 'zustand'

/** Which channels a selection covers. On a mono sample it is always `both`. */
export type WaveChannels = 'both' | 'left' | 'right'

/** A selection in frames, from `from` up to (not including) `to`, `from < to`. */
export interface WaveSelection {
  readonly from: number
  readonly to: number
  readonly channels: WaveChannels
}

/** How one sample is looked at in the Wave editor. */
export interface WaveEditorView {
  /** Frames per pixel column, or null to fit the whole sample in the width (what a sample opens with). */
  readonly framesPerPixel: number | null
  /** The frame at the left edge. */
  readonly startFrame: number
  /** Where ▶ plays from without a selection. */
  readonly cursor: number
  readonly selection: WaveSelection | null
}

export const DEFAULT_WAVE_VIEW: WaveEditorView = { framesPerPixel: null, startFrame: 0, cursor: 0, selection: null }

interface WaveEditorState {
  /** By the sample's origin (`originOf`), so a view follows its sample through edits, undo and redo. */
  readonly views: Readonly<Record<string, WaveEditorView>>
  setView(key: string, change: Partial<WaveEditorView>): void
  /** Sets the selection: ordered, and none when it is empty. */
  select(key: string, selection: WaveSelection | null): void
}

/**
 * The Wave editor's view of each sample, in memory: zoom, scroll, cursor and selection, so they survive tab switches and
 * switching samples until reload. Not saved with the project and not undone.
 */
export const useWaveEditorStore = create<WaveEditorState>((set) => ({
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
}))

/** One sample's view, by its origin, or the default for a sample not looked at yet. */
export const waveViewOf = (views: Readonly<Record<string, WaveEditorView>>, key: string): WaveEditorView =>
  views[key] ?? DEFAULT_WAVE_VIEW
