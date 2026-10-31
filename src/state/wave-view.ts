import { frameCount, savedFrameCount } from '@core'
import type { SampleLibrary } from './sample-library'
import { useStatusStore } from './status-store'
import { useWaveEditSettings } from './wave-edit-settings'
import { openWave } from './wave-edits'
import { useWaveEditorStore } from './wave-editor-store'

/** Whether a sample's preview is playing. */
export const isWavePreviewing = (sampleId: string): boolean => useStatusStore.getState().status?.preview?.sampleId === sampleId

/** ▶: plays the selection, or from the cursor to the end, looping with *Loop*; while it plays, stops it. */
export const toggleWavePreview = (library: SampleLibrary, sampleId: string): void => {
  if (isWavePreviewing(sampleId)) return library.stopPreview()
  const open = openWave(sampleId)
  if (!open) return
  const { selection, cursor } = open.view
  const loop = useWaveEditSettings.getState().loop
  library.preview(sampleId, selection ? { from: selection.from, to: selection.to, loop } : { from: cursor, loop })
}

/** Selects the whole sample, on the channels the selection had, else both. */
export const selectAllWave = (sampleId: string): void => {
  const open = openWave(sampleId)
  if (!open) return
  const frames = open.wave ? frameCount(open.wave.audio) : savedFrameCount(open.sample)
  useWaveEditorStore.getState().select(open.key, { from: 0, to: frames, channels: open.view.selection?.channels ?? 'both' })
}
