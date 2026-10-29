import { arrangementEnd, isAudioContent } from '@core'
import { openClip, openRegion } from '../navigation'
import { useProjectStore } from '../project-store'
import { clipClipboard } from './clipboards'
import { project, sessionClipOf } from './lookup'
import type { Action, SubjectOf } from './types'

type RegionSubject = SubjectOf<'region'>

const regionOf = ({ regionId }: RegionSubject) => (project().arrangement ?? []).find((region) => region.id === regionId)

/** A region on the arrangement timeline: a copy of a clip at a beat. */
export const regionActions: readonly Action<RegionSubject>[] = [
  {
    id: 'region.edit',
    title: 'Edit',
    group: 'open',
    // Its own copy, in Clip.
    run: ({ regionId }) => openRegion(regionId),
  },
  {
    id: 'region.edit-session-clip',
    title: 'Edit session clip',
    group: 'open',
    // A region's content is a copy; its session source may have been changed, moved or deleted since.
    enabled: (subject) => {
      const region = regionOf(subject)
      return !!region && !!sessionClipOf(region.trackId, region.content.id)
    },
    run: (subject) => {
      const region = regionOf(subject)
      if (region) openClip(region.trackId, region.content.id)
    },
  },
  {
    id: 'region.duplicate',
    verb: 'duplicate',
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
    id: 'region.copy',
    verb: 'copy',
    title: 'Copy',
    group: 'clipboard',
    run: (subject) => {
      const region = regionOf(subject)
      if (region) clipClipboard.set({ clip: region.content, kind: isAudioContent(region.content) ? 'audio' : 'instrument' })
    },
  },
  {
    id: 'region.delete',
    verb: 'delete',
    title: 'Delete',
    group: 'delete',
    danger: true,
    run: ({ regionId }) => useProjectStore.getState().removeArrangementClip(regionId),
  },
]
