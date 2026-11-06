import { arrangementEnd, arrangementLoopEnd, isAudioContent } from '@core'
import { openClip, openRegion } from '../navigation'
import { useProjectStore } from '../project-store'
import { isRecordingRegion, stopRecordingRegion } from '../record-store'
import { editSampleOf, sampleInLibrary } from './clip'
import { clipClipboard } from './clipboards'
import { project, sessionClipOf } from './lookup'
import type { Action, SubjectOf } from './types'

type RegionSubject = SubjectOf<'region'>

const regionOf = ({ regionId }: RegionSubject) => (project().arrangement ?? []).find((region) => region.id === regionId)

/** A region being recorded is locked: changing it would end the take. */
const notRecording = ({ regionId }: RegionSubject) => !isRecordingRegion(regionId)
const RECORDING_TIP = 'Recording into this region: stop recording first'

const audioOf = (subject: RegionSubject) => {
  const content = regionOf(subject)?.content
  return content && isAudioContent(content) ? content : undefined
}

/** A region on the arrangement timeline: a copy of a clip at a beat. */
export const regionActions: readonly Action<RegionSubject>[] = [
  {
    id: 'region.stop-recording',
    title: 'Stop recording',
    group: 'open',
    applies: ({ regionId }) => isRecordingRegion(regionId),
    run: ({ regionId }) => stopRecordingRegion(regionId),
  },
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
    id: 'region.edit-sample',
    title: 'Edit sample',
    group: 'open',
    tooltip: (subject) => (sampleInLibrary(audioOf(subject)) ? 'Open the sample in the Wave editor, at the part this region plays' : 'The sample is no longer in the library'),
    applies: (subject) => !!audioOf(subject),
    enabled: (subject) => sampleInLibrary(audioOf(subject)),
    run: (subject) => editSampleOf(audioOf(subject)),
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
    enabled: notRecording,
    tooltip: (subject) => (notRecording(subject) ? undefined : RECORDING_TIP),
    run: (subject) => {
      const region = regionOf(subject)
      if (region) useProjectStore.getState().updateArrangementClip(region.id, { loop: !region.loop })
    },
  },
  {
    id: 'region.set-loop',
    title: 'Set loop to region',
    group: 'edit',
    tooltip: () => 'Put the loop brace over the region, to where it stops sounding',
    run: (subject) => {
      const region = regionOf(subject)
      if (region) useProjectStore.getState().setArrangementLoop({ from: region.startBeat, to: arrangementLoopEnd(region, project().arrangement ?? []) })
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
    enabled: notRecording,
    tooltip: (subject) => (notRecording(subject) ? undefined : RECORDING_TIP),
    run: ({ regionId }) => useProjectStore.getState().removeArrangementClip(regionId),
  },
]
