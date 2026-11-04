import { type Crossfade, DEFAULT_CROSSFADE, DEFAULT_SPECTRUM_FFT_SIZE, type FadeCurve, type SpectrumFftSize, clampCrossfadeSeconds, isCrossfadeCurve, isFadeCurve, isSpectrumFftSize } from '@core'
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
  /** Pointer gestures snap to the beat grid (while the ruler counts beats) and to zero crossings; both off at first. */
  readonly snap: WaveSnap
  /** What every lane of the editor shows, in both panes. */
  readonly lanes: WaveLanes
  /** How the spectrogram is computed and drawn. */
  readonly spectrum: SpectrumSettings
}

/** The lanes' modes: the waveform, a spectrogram, or the waveform over the spectrogram. */
export type WaveLanes = 'waveform' | 'spectrogram' | 'split'
export const WAVE_LANES: readonly WaveLanes[] = ['waveform', 'spectrogram', 'split']
export const isWaveLanes = (value: unknown): value is WaveLanes => WAVE_LANES.includes(value as WaveLanes)

/** The lanes show the spectrogram, so it is computed. */
export const showsSpectrum = (lanes: WaveLanes): boolean => lanes !== 'waveform'

export interface SpectrumSettings {
  /** How frequencies are spread over the lane's height. */
  readonly scale: 'log' | 'linear'
  /** A new size computes the spectra again. */
  readonly fftSize: SpectrumFftSize
  /** The level the color scale starts at, in dB: `SPECTRUM_FLOOR_RANGE_DB`. */
  readonly floorDb: number
}

export const SPECTRUM_FLOOR_RANGE_DB = { min: -120, max: -60 } as const

const clampFloorDb = (db: number) => Math.round(Math.min(SPECTRUM_FLOOR_RANGE_DB.max, Math.max(SPECTRUM_FLOOR_RANGE_DB.min, db)))

/** What pointer gestures snap to. With either on, they also snap to markers, region edges and the loop's edges. */
export interface WaveSnap {
  readonly beats: boolean
  readonly zero: boolean
}

export const DEFAULT_WAVE_EDIT_SETTINGS: WaveEditSettings = {
  asCopy: false,
  crossfade: DEFAULT_CROSSFADE,
  fadeCurve: 'linear',
  lastValues: {},
  loop: false,
  snap: { beats: false, zero: false },
  lanes: 'waveform',
  spectrum: { scale: 'log', fftSize: DEFAULT_SPECTRUM_FFT_SIZE, floorDb: -100 },
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isCrossfade = (value: unknown): value is Crossfade =>
  isObject(value) && typeof value.seconds === 'number' && Number.isFinite(value.seconds) && isCrossfadeCurve(value.curve)
const isSpectrum = (value: unknown): value is SpectrumSettings =>
  isObject(value) && (value.scale === 'log' || value.scale === 'linear') && isSpectrumFftSize(value.fftSize) && typeof value.floorDb === 'number' && Number.isFinite(value.floorDb)
const isSnap = (value: unknown): value is WaveSnap => isObject(value) && typeof value.beats === 'boolean' && typeof value.zero === 'boolean'
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
  setSnap(change: Partial<WaveSnap>): void
  setLanes(lanes: WaveLanes): void
  /** The floor is clamped to `SPECTRUM_FLOOR_RANGE_DB`. */
  setSpectrum(change: Partial<SpectrumSettings>): void
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
  setSnap: (change) => set((state) => ({ snap: { ...state.snap, ...change } })),
  setLanes: (lanes) => set({ lanes }),
  setSpectrum: (change) =>
    set((state) => {
      const spectrum = { ...state.spectrum, ...change }
      return { spectrum: { ...spectrum, floorDb: clampFloorDb(spectrum.floorDb) } }
    }),
  restore: (saved) =>
    set({
      asCopy: typeof saved.asCopy === 'boolean' ? saved.asCopy : DEFAULT_WAVE_EDIT_SETTINGS.asCopy,
      crossfade: isCrossfade(saved.crossfade) ? { ...saved.crossfade, seconds: clampCrossfadeSeconds(saved.crossfade.seconds) } : DEFAULT_WAVE_EDIT_SETTINGS.crossfade,
      fadeCurve: isFadeCurve(saved.fadeCurve) ? saved.fadeCurve : DEFAULT_WAVE_EDIT_SETTINGS.fadeCurve,
      lastValues: lastValuesOf(saved.lastValues) ?? DEFAULT_WAVE_EDIT_SETTINGS.lastValues,
      loop: typeof saved.loop === 'boolean' ? saved.loop : DEFAULT_WAVE_EDIT_SETTINGS.loop,
      snap: isSnap(saved.snap) ? { beats: saved.snap.beats, zero: saved.snap.zero } : DEFAULT_WAVE_EDIT_SETTINGS.snap,
      lanes: isWaveLanes(saved.lanes) ? saved.lanes : DEFAULT_WAVE_EDIT_SETTINGS.lanes,
      spectrum: isSpectrum(saved.spectrum)
        ? { scale: saved.spectrum.scale, fftSize: saved.spectrum.fftSize, floorDb: clampFloorDb(saved.spectrum.floorDb) }
        : DEFAULT_WAVE_EDIT_SETTINGS.spectrum,
    }),
}))
