import { type Crossfade, DEFAULT_CROSSFADE, type FadeCurve, clampCrossfadeSeconds, isCrossfadeCurve, isFadeCurve } from '@core'
import { create } from 'zustand'

/** The values of an edit's settings popover, by setting id. */
export type EditValues = Readonly<Record<string, number>>

/** How the Wave editor's edits and preview run, per browser: set once and rarely changed. */
export interface WaveEditSettings {
  /** *Edits make copies*: each edit adds a new sample instead of changing this one. */
  readonly asCopy: boolean
  /** Every join, and the edges of the edge-ramped processes, crossfade over this. */
  readonly crossfade: Crossfade
  /** The curve *Fade in* and *Fade out* last used. */
  readonly fadeCurve: FadeCurve
  /** Each edit's popover values as last applied, by edit kind. */
  readonly lastValues: Readonly<Record<string, EditValues>>
  /** The preview loops. */
  readonly loop: boolean
}

export const DEFAULT_WAVE_EDIT_SETTINGS: WaveEditSettings = { asCopy: false, crossfade: DEFAULT_CROSSFADE, fadeCurve: 'linear', lastValues: {}, loop: false }

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isCrossfade = (value: unknown): value is Crossfade =>
  isObject(value) && typeof value.seconds === 'number' && Number.isFinite(value.seconds) && isCrossfadeCurve(value.curve)
/** Saved popover values: an object per edit kind, keeping its numeric fields (an emptied field was saved as null). */
const lastValuesOf = (value: unknown): WaveEditSettings['lastValues'] | null =>
  isObject(value) && Object.values(value).every(isObject)
    ? Object.fromEntries(Object.entries(value).map(([kind, fields]) => [kind, Object.fromEntries(Object.entries(fields as object).filter(([, field]) => typeof field === 'number'))]))
    : null

interface WaveEditSettingsState extends WaveEditSettings {
  setAsCopy(asCopy: boolean): void
  /** The length is clamped to 0 to `MAX_CROSSFADE_SECONDS`. */
  setCrossfade(crossfade: Crossfade): void
  setFadeCurve(curve: FadeCurve): void
  setLastValues(kind: string, values: EditValues): void
  setLoop(loop: boolean): void
  /** Takes what was saved, field by field: a value that isn't valid keeps the default. */
  restore(saved: { readonly [K in keyof WaveEditSettings]?: unknown }): void
}

/**
 * The Wave editor's edit and preview settings. `state` doesn't touch `localStorage`, so `ui` restores them once when the Wave
 * editor mounts and saves each change (`useWaveEditSettingsStorage`), under the keys the toolbar used before.
 */
export const useWaveEditSettings = create<WaveEditSettingsState>((set) => ({
  ...DEFAULT_WAVE_EDIT_SETTINGS,
  setAsCopy: (asCopy) => set({ asCopy }),
  setCrossfade: (crossfade) => set({ crossfade: { ...crossfade, seconds: clampCrossfadeSeconds(crossfade.seconds) } }),
  setFadeCurve: (fadeCurve) => set({ fadeCurve }),
  setLastValues: (kind, values) => set((state) => ({ lastValues: { ...state.lastValues, [kind]: values } })),
  setLoop: (loop) => set({ loop }),
  restore: (saved) =>
    set({
      asCopy: typeof saved.asCopy === 'boolean' ? saved.asCopy : DEFAULT_WAVE_EDIT_SETTINGS.asCopy,
      crossfade: isCrossfade(saved.crossfade) ? { ...saved.crossfade, seconds: clampCrossfadeSeconds(saved.crossfade.seconds) } : DEFAULT_WAVE_EDIT_SETTINGS.crossfade,
      fadeCurve: isFadeCurve(saved.fadeCurve) ? saved.fadeCurve : DEFAULT_WAVE_EDIT_SETTINGS.fadeCurve,
      lastValues: lastValuesOf(saved.lastValues) ?? DEFAULT_WAVE_EDIT_SETTINGS.lastValues,
      loop: typeof saved.loop === 'boolean' ? saved.loop : DEFAULT_WAVE_EDIT_SETTINGS.loop,
    }),
}))
