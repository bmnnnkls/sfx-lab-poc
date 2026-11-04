import { frameCount, savedFrameCount } from '@core'
import type { SampleLibrary } from './sample-library'
import { useStatusStore } from './status-store'
import { useWaveEditSettings } from './wave-edit-settings'
import { openWave } from './wave-edits'
import { useWaveEditorStore } from './wave-editor-store'
import type { WaveAt } from './wave-panes'

/** Whether a sample's preview is playing. */
export const isWavePreviewing = (sampleId: string): boolean => useStatusStore.getState().status?.preview?.sampleId === sampleId

/** ▶: plays a pane's selection, or from its cursor to the end, looping with *Loop*; while the sample plays, stops it. */
export const toggleWavePreview = (library: SampleLibrary, at: WaveAt): void => {
  const { sampleId } = at
  if (isWavePreviewing(sampleId)) return library.stopPreview()
  const open = openWave(at)
  if (!open) return
  const { selection, cursor } = open.view
  const loop = useWaveEditSettings.getState().loop
  library.preview(sampleId, selection ? { from: selection.from, to: selection.to, loop } : { from: cursor, loop })
}

/** Selects the whole sample in a pane, on the channels the selection had, else both. */
export const selectAllWave = (at: WaveAt): void => {
  const open = openWave(at)
  if (!open) return
  const frames = open.wave ? frameCount(open.wave.audio) : savedFrameCount(open.sample)
  useWaveEditorStore.getState().select(open.key, { from: 0, to: frames, channels: open.view.selection?.channels ?? 'both' })
}
