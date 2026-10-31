import type { SpectrumService } from '@audio'
import { type SpectrumPyramid, createSpectrumPyramid, frameCount, putSpectrumColumns, spectrumChunks, updateSpectrumPyramid } from '@core'
import { WAVE_PANES, type WaveAudio, showsSpectrum, useWaveAudioStore, useWaveEditSettings, useWaveEditorStore, useWaveSpectrumStore, waveViewOf } from '@state'

/** The stores keep no view's width; the fill takes the view this wide when it puts the view's columns first. */
const VIEW_GUESS_PX = 2000

export interface WaveSpectra {
  connect(): () => void
}

/**
 * The spectra of the samples the Wave editor's panes show, while the lanes show the spectrogram
 * (`useWaveEditSettings.lanes`): one per sample at the setting's FFT size, in `useWaveSpectrumStore`, computed by the
 * spectrum service in chunks, the pane's view first. An edit's result starts from its source's spectrum
 * (`updateSpectrumPyramid`), so only the columns whose windows touch the change are computed again. A spectrum goes,
 * and its job stops, when no pane shows its sample, the lanes stop showing it, or the FFT size changes.
 */
export const createWaveSpectra = (service: SpectrumService): WaveSpectra => {
  const jobs = new Map<string, () => void>()

  const stop = (sampleId: string) => {
    jobs.get(sampleId)?.()
    jobs.delete(sampleId)
  }

  const start = (wave: WaveAudio, pyramid: SpectrumPyramid) => {
    const { sampleId } = wave
    const view = waveViewOf(useWaveEditorStore.getState().views, wave.viewKey)
    const around = view.framesPerPixel ? { from: view.startFrame, to: view.startFrame + view.framesPerPixel * VIEW_GUESS_PX } : undefined
    const chunks = spectrumChunks(pyramid, around)
    if (chunks.length === 0) return
    const cancel = service.spectrumOf(
      { channels: wave.audio.channels, fftSize: pyramid.fftSize, chunks },
      (chunk) => {
        putSpectrumColumns(pyramid, chunk.from, chunk.to, chunk.bytes)
        useWaveSpectrumStore.getState().filled(sampleId)
      },
      () => {
        if (jobs.get(sampleId) === cancel) jobs.delete(sampleId)
      },
    )
    jobs.set(sampleId, cancel)
  }

  const sync = () => {
    const { lanes, spectrum } = useWaveEditSettings.getState()
    const panes = useWaveAudioStore.getState().panes
    const shown = new Map<string, WaveAudio>()
    if (showsSpectrum(lanes)) {
      for (const pane of WAVE_PANES) {
        const wave = panes[pane]
        if (wave && !shown.has(wave.sampleId)) shown.set(wave.sampleId, wave)
      }
    }
    const store = useWaveSpectrumStore.getState()
    const before = store.spectra
    // New spectra first, so an edit's result is made from its source before the source goes.
    for (const [sampleId, wave] of shown) {
      if (before[sampleId]?.fftSize === spectrum.fftSize) continue
      const source = wave.editedFrom && before[wave.editedFrom.sampleId]
      const pyramid =
        source && source.fftSize === spectrum.fftSize
          ? updateSpectrumPyramid(source.pyramid, wave.audio, wave.editedFrom!.changed)
          : createSpectrumPyramid(frameCount(wave.audio), wave.audio.channels.length, spectrum.fftSize, wave.audio.sampleRate)
      stop(sampleId)
      store.setSpectrum(sampleId, { sampleId, fftSize: spectrum.fftSize, pyramid, version: 0 })
      start(wave, pyramid)
    }
    for (const sampleId of Object.keys(before)) {
      if (shown.has(sampleId)) continue
      stop(sampleId)
      store.setSpectrum(sampleId, null)
    }
  }

  return {
    connect: () => {
      sync()
      const unsubscribeAudio = useWaveAudioStore.subscribe((state, previous) => {
        if (state.panes !== previous.panes) sync()
      })
      const unsubscribeSettings = useWaveEditSettings.subscribe((state, previous) => {
        if (state.lanes !== previous.lanes || state.spectrum.fftSize !== previous.spectrum.fftSize) sync()
      })
      return () => {
        unsubscribeAudio()
        unsubscribeSettings()
        for (const sampleId of [...jobs.keys()]) stop(sampleId)
      }
    },
  }
}
