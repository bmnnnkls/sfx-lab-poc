import type { SpectrumPyramid } from '@core'
import { create } from 'zustand'

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
}

/**
 * Filled in by the wave spectra service (`app/wave-spectrum.ts`) while the lanes show the spectrogram; read by the lanes
 * through a subscription, so the chunks redraw them without React rendering.
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
}))
