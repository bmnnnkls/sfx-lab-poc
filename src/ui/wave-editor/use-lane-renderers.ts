import { type WaveLanes, useWaveEditSettings } from '@state'
import { useMemo } from 'react'
import { type LanePart, type LaneRenderers, laneParts, waveformRenderer } from './lane-renderers'
import { spectrogramRenderer } from './spectrogram'

/** The lane mode, its parts and the renderers for a sample at `sampleRate`, made again only when a setting changes. */
export const useLaneRenderers = (sampleRate: number): { lanes: WaveLanes; parts: readonly LanePart[]; renderers: LaneRenderers } => {
  const lanes = useWaveEditSettings((state) => state.lanes)
  const scale = useWaveEditSettings((state) => state.spectrum.scale)
  const floorDb = useWaveEditSettings((state) => state.spectrum.floorDb)
  const parts = useMemo(() => laneParts(lanes), [lanes])
  const renderers = useMemo<LaneRenderers>(() => ({ waveform: waveformRenderer, spectrogram: spectrogramRenderer({ scale, floorDb }, sampleRate) }), [scale, floorDb, sampleRate])
  return { lanes, parts, renderers }
}
