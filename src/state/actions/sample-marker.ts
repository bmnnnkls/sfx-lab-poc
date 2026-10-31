import { removeMarker } from '@core'
import { useProjectStore } from '../project-store'
import { goToWaveFrame, markerOf } from '../wave-marks'
import { renameAction } from './rename'
import type { Action, SubjectOf } from './types'

type MarkerSubject = SubjectOf<'sample-marker'>

const exists = ({ sampleId, markerId }: MarkerSubject) => markerOf(sampleId, markerId) !== undefined

const actions: readonly Action<MarkerSubject>[] = [
  {
    id: 'sample-marker.go-to',
    title: 'Go to',
    group: 'open',
    tooltip: () => 'Put the cursor at the marker',
    run: ({ sampleId, markerId }) => {
      const marker = markerOf(sampleId, markerId)
      if (marker) goToWaveFrame(sampleId, marker.frame)
    },
  },
  renameAction('sample-marker'),
  {
    id: 'sample-marker.delete',
    verb: 'delete',
    title: 'Delete',
    group: 'delete',
    run: ({ sampleId, markerId }) => useProjectStore.getState().editSampleMarks(sampleId, (info) => removeMarker(info, markerId)),
  },
]

/** A marker in the Wave editor's mark lane, from its right-click menu, the palette and the edit keys. */
export const sampleMarkerActions: readonly Action<MarkerSubject>[] = actions.map((action) => ({ ...action, applies: exists }))
