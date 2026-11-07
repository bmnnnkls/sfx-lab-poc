import { type WaveLanes, useWaveEditSettings } from '@state'
import { useMemo } from 'react'
import { type LanePart, type LaneRenderers, laneParts, waveformRenderer } from './lane-renderers'
import { useThemeColors } from '../theme/theme-colors'
import { SPECTRUM_TOKENS, frequencyAt, frequencyY, spectrogramRenderer } from './spectrogram'

/** The spectrogram's frequency scale in a part `height` px high: a frequency's row, and the frequency at a row. */
export interface FrequencyScale {
  rowOf(hz: number, height: number): number
  /** The frequency at row `y`; at or past the bottom 0 Hz, at or past the top the Nyquist frequency. */
  hzAt(y: number, height: number): number
}

/** The lane mode, its parts, the renderers and the frequency scale for a sample at `sampleRate`, made again only when a setting changes. */
export const useLaneRenderers = (sampleRate: number): { lanes: WaveLanes; parts: readonly LanePart[]; renderers: LaneRenderers; frequencies: FrequencyScale } => {
  const lanes = useWaveEditSettings((state) => state.lanes)
  const scale = useWaveEditSettings((state) => state.spectrum.scale)
  const floorDb = useWaveEditSettings((state) => state.spectrum.floorDb)
  const spectrum = useThemeColors(SPECTRUM_TOKENS)
  const parts = useMemo(() => laneParts(lanes), [lanes])
  // Made again when the theme changes, which also redraws the lanes (they redraw when the renderers do), and its color table is per theme and floor.
  const renderers = useMemo<LaneRenderers>(
    () => ({ waveform: waveformRenderer, spectrogram: spectrogramRenderer({ scale, floorDb }, sampleRate, SPECTRUM_TOKENS.map((token) => spectrum[token])) }),
    [scale, floorDb, sampleRate, spectrum],
  )
  const frequencies = useMemo<FrequencyScale>(() => {
    const nyquist = sampleRate / 2
    return {
      rowOf: (hz, height) => frequencyY(hz, height, scale, nyquist),
      hzAt: (y, height) => (y >= height ? 0 : y <= 0 ? nyquist : frequencyAt(y, height, scale, nyquist)),
    }
  }, [scale, sampleRate])
  return { lanes, parts, renderers, frequencies }
}
