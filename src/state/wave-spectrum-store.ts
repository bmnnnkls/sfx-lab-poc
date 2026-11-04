import type { SpectrumAnswered, SpectrumAsk, SpectrumPyramid } from '@core'
import { create } from 'zustand'
import type { WavePane } from './wave-panes'

/** The spectrum of a sample a pane of the Wave editor shows, filled in as it is computed. */
export interface WaveSpectrum {
  readonly sampleId: string
  readonly fftSize: number
  /** Filled in place, chunk by chunk; `version` says when. */
  readonly pyramid: SpectrumPyramid
  /** Counts the chunks put in, so a lane redraws when one arrives. */
  readonly version: number
}

interface WaveSpectrumState {
  /** By sample: two panes on one sample share its spectrum, as they share its audio. */
  readonly spectra: Readonly<Record<string, WaveSpectrum>>
  /** A sample's spectrum, or none. */
  setSpectrum(sampleId: string, spectrum: WaveSpectrum | null): void
  /** A chunk went into the sample's pyramid. */
  filled(sampleId: string): void
  /** What each pane's view asks for, zoomed in past the pyramid's hop (`spectrumAsk`): its own columns. */
  readonly asks: Readonly<Record<WavePane, SpectrumAsk | null>>
  /** The columns each pane was given, for the ask it made last. */
  readonly answers: Readonly<Record<WavePane, SpectrumAnswered | null>>
  ask(pane: WavePane, ask: SpectrumAsk | null): void
  answer(pane: WavePane, answered: SpectrumAnswered): void
}

const NO_PANES = { main: null, second: null } as const

/**
 * Filled in by the wave spectra service (`app/wave-spectrum.ts`) while the lanes show the spectrogram; read by the lanes
 * through a subscription, so the chunks redraw them without React rendering. Zoomed in, a pane's lanes ask here for
 * their view's own columns (`ask`), and the service answers here (`answer`): `ui` reaches the worker only through
 * `state`.
 */
export const useWaveSpectrumStore = create<WaveSpectrumState>((set) => ({
  spectra: {},
  setSpectrum: (sampleId, spectrum) =>
    set((state) => {
      const { [sampleId]: _, ...rest } = state.spectra
      return { spectra: spectrum ? { ...rest, [sampleId]: spectrum } : rest }
    }),
  filled: (sampleId) =>
    set((state) => {
      const spectrum = state.spectra[sampleId]
      return spectrum ? { spectra: { ...state.spectra, [sampleId]: { ...spectrum, version: spectrum.version + 1 } } } : state
    }),
  asks: NO_PANES,
  answers: NO_PANES,
  ask: (pane, ask) => set((state) => ({ asks: { ...state.asks, [pane]: ask } })),
  answer: (pane, answered) => set((state) => ({ answers: { ...state.answers, [pane]: answered } })),
}))
