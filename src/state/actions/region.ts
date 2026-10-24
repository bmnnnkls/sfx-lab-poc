import { arrangementEnd } from '@core'
import { useProjectStore } from '../project-store'
import { project } from './lookup'
import type { Action, SubjectOf } from './types'

type RegionSubject = SubjectOf<'region'>

const regionOf = ({ regionId }: RegionSubject) => (project().arrangement ?? []).find((region) => region.id === regionId)

/** A region on the arrangement timeline: a copy of a clip at a beat. */
export const regionActions: readonly Action<RegionSubject>[] = [
  {
    id: 'region.duplicate',
    title: 'Duplicate',
    group: 'edit',
    run: (subject) => {
      const region = regionOf(subject)
      if (region) useProjectStore.getState().addArrangementClip(region.trackId, arrangementEnd(region), region.content)
    },
  },
  {
    id: 'region.loop',
    title: (subject) => (regionOf(subject)?.loop ? 'Stop looping' : 'Loop until next region'),
    group: 'edit',
    run: (subject) => {
      const region = regionOf(subject)
      if (region) useProjectStore.getState().updateArrangementClip(region.id, { loop: !region.loop })
    },
  },
  {
    id: 'region.delete',
    title: 'Delete',
    group: 'delete',
    danger: true,
    run: ({ regionId }) => useProjectStore.getState().removeArrangementClip(regionId),
  },
]
