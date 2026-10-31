import { removeRegion } from '@core'
import { useProjectStore } from '../project-store'
import { playWaveRange, regionOf, selectWaveRange, setWaveLoop, zoomWaveTo } from '../wave-marks'
import { isWavePreviewing } from '../wave-view'
import { useWaveEditSettings } from '../wave-edit-settings'
import { renameAction } from './rename'
import type { Action, SubjectOf } from './types'

type RegionSubject = SubjectOf<'sample-region'>

const exists = ({ sampleId, regionId }: RegionSubject) => regionOf(sampleId, regionId) !== undefined
/** Runs `then` with the region, if it is still there. */
const withRegion = (then: (region: NonNullable<ReturnType<typeof regionOf>>, subject: RegionSubject) => void) => (subject: RegionSubject) => {
  const region = regionOf(subject.sampleId, subject.regionId)
  if (region) then(region, subject)
}

const actions: readonly Action<RegionSubject>[] = [
  {
    id: 'sample-region.select',
    title: 'Select',
    group: 'open',
    tooltip: () => 'Select the region',
    run: withRegion((region, subject) => selectWaveRange(subject, region)),
  },
  renameAction('sample-region'),
  {
    id: 'sample-region.delete',
    verb: 'delete',
    title: 'Delete',
    group: 'delete',
    tooltip: () => 'Delete the region; the audio stays',
    run: ({ sampleId, regionId }) => useProjectStore.getState().editSampleMarks(sampleId, (info) => removeRegion(info, regionId)),
  },
  {
    id: 'sample-region.set-loop',
    title: 'Set loop from region',
    group: 'marks',
    tooltip: () => "Make the region the sample's loop, which a sampler in loop mode repeats",
    run: withRegion((region, subject) => setWaveLoop(subject, region)),
  },
  {
    id: 'sample-region.play',
    title: ({ sampleId }) => (isWavePreviewing(sampleId) ? 'Stop' : 'Play'),
    group: 'view',
    run: ({ sampleId, regionId }, { samples }) => {
      const region = regionOf(sampleId, regionId)
      if (region) playWaveRange(samples, sampleId, region, useWaveEditSettings.getState().loop)
    },
  },
  {
    id: 'sample-region.zoom',
    title: 'Zoom to region',
    group: 'view',
    run: withRegion((region, subject) => zoomWaveTo(subject, region)),
  },
]

/** A region in the Wave editor's mark lane, from its right-click menu, the palette and the edit keys. */
export const sampleRegionActions: readonly Action<RegionSubject>[] = actions.map((action) => ({ ...action, applies: exists }))
