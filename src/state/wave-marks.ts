import { type FrameRange, SAMPLE_MARK_LIMITS, type SampleInfo, type SampleMarker, type SampleRegion, addMarker, addRegion, createMarkId, setLoop } from '@core'
import { useProjectStore } from './project-store'
import type { SampleLibrary } from './sample-library'
import { isWavePreviewing } from './wave-view'
import { openWave } from './wave-edits'
import { useWaveEditorStore } from './wave-editor-store'

/**
 * The Wave editor's markers, regions and loop, for the actions, the keys and the mark lane alike: adding them from the
 * cursor and the selection, and moving the cursor, the selection and the view to them. Each change is one undo step
 * (`editSampleMarks`).
 */

/** What a mark is added from: *Add marker* the cursor, *Make region* and *Set loop* the selection. */
export type WaveMarkKind = 'marker' | 'region' | 'loop'

/** Why a mark can't be added to the sample now, or null. */
export const waveMarkBlocked = (sampleId: string, kind: WaveMarkKind): string | null => {
  const open = openWave(sampleId)
  if (!open) return 'The sample is gone'
  if (kind === 'marker') return (open.sample.markers?.length ?? 0) >= SAMPLE_MARK_LIMITS.markers ? `A sample keeps at most ${SAMPLE_MARK_LIMITS.markers} markers` : null
  if (!open.view.selection) return 'Select a part first'
  if (kind === 'region' && (open.sample.regions?.length ?? 0) >= SAMPLE_MARK_LIMITS.regions) return `A sample keeps at most ${SAMPLE_MARK_LIMITS.regions} regions`
  return null
}

const edit = (sampleId: string, change: (info: SampleInfo) => SampleInfo) => useProjectStore.getState().editSampleMarks(sampleId, change)

/** *Add marker*: one at the cursor, exactly. Returns its id, or null when it can't be added. */
export const addWaveMarker = (sampleId: string): string | null => {
  const open = openWave(sampleId)
  if (!open || waveMarkBlocked(sampleId, 'marker')) return null
  const id = createMarkId('marker')
  edit(sampleId, (info) => addMarker(info, open.view.cursor, undefined, id))
  return id
}

/** *Make region*: the selection as a region. Returns its id, or null when it can't be made. */
export const makeWaveRegion = (sampleId: string): string | null => {
  const selection = openWave(sampleId)?.view.selection
  if (!selection || waveMarkBlocked(sampleId, 'region')) return null
  const id = createMarkId('region')
  edit(sampleId, (info) => addRegion(info, selection, undefined, id))
  return id
}

/** *Set loop*: the selection, or `range` (a region's), becomes the sample's loop. */
export const setWaveLoop = (sampleId: string, range?: FrameRange): void => {
  const loop = range ?? openWave(sampleId)?.view.selection
  if (loop) edit(sampleId, (info) => setLoop(info, loop))
}

export const markerOf = (sampleId: string, markerId: string): SampleMarker | undefined =>
  openWave(sampleId)?.sample.markers?.find((marker) => marker.id === markerId)

export const regionOf = (sampleId: string, regionId: string): SampleRegion | undefined =>
  openWave(sampleId)?.sample.regions?.find((region) => region.id === regionId)

/** The marker exactly at the cursor (the one *Add marker* just put there, or `[` `]` stepped to), if any. */
export const markerAtCursor = (sampleId: string): SampleMarker | undefined => {
  const open = openWave(sampleId)
  return open?.sample.markers?.find((marker) => marker.frame === open.view.cursor)
}

/** *Go to*: the cursor at a frame, without a selection, and the view scrolled by the least that shows it. */
export const goToWaveFrame = (sampleId: string, frame: number): void => {
  const open = openWave(sampleId)
  if (!open) return
  const store = useWaveEditorStore.getState()
  store.select(open.key, null)
  store.setView(open.key, { cursor: frame, zoomTo: { show: frame } })
}

/** *Select*: a region or the loop becomes the selection, on both channels, with the cursor at its start. */
export const selectWaveRange = (sampleId: string, range: FrameRange): void => {
  const open = openWave(sampleId)
  if (!open) return
  const store = useWaveEditorStore.getState()
  store.select(open.key, { from: range.from, to: range.to, channels: 'both' })
  store.setView(open.key, { cursor: range.from })
}

/** *Zoom to region*, *Zoom to loop*. */
export const zoomWaveTo = (sampleId: string, range: FrameRange): void => {
  const open = openWave(sampleId)
  if (open) useWaveEditorStore.getState().zoom(open.key, { from: range.from, to: range.to })
}

/** *Play* a region (looping with the preview's *Loop*, as ▶ does) or *Play loop* (`loop`: always looping); again to stop. */
export const playWaveRange = (library: SampleLibrary, sampleId: string, range: FrameRange, loop: boolean): void => {
  if (isWavePreviewing(sampleId)) return library.stopPreview()
  library.preview(sampleId, { from: range.from, to: range.to, loop })
}
