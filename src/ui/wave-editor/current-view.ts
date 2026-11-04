import { type WaveView, frameCount } from '@core'
import { type WaveAudio, useWaveEditorStore, waveViewOf } from '@state'
import { resolveView } from './wave-geometry'

/** The view as the detail shows it now: read from the store, in the width the detail element has. */
export const currentView = (detail: HTMLElement | null, wave: WaveAudio): WaveView =>
  resolveView(waveViewOf(useWaveEditorStore.getState().views, wave.viewKey), frameCount(wave.audio), detail?.clientWidth ?? 1)
