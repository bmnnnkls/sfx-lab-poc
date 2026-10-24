import { type AudioClip, type Clip, arrangementOnTrack, clipCopyFor, clipFitsTrack } from '@core'
import { useProjectStore } from '../project-store'
import { clipClipboard } from './clipboards'
import { project, trackOf } from './lookup'
import type { Action, SubjectOf } from './types'

type LaneSubject = SubjectOf<'lane'>

const sessionClips = (trackId: string) => {
  const track = trackOf(trackId)
  return track && track.kind !== 'return' ? track.clips.filter((clip) => clip !== null) : []
}

/** Whether a clip value plays on a lane's track: of its kind, and an audio clip's sample still in the project. */
export const canPasteClipOnLane = (clip: Clip | AudioClip, trackId: string): boolean =>
  clipFitsTrack(clip, trackOf(trackId)) && ('notes' in clip || project().samples.some((sample) => sample.id === clip.sampleId))

/** Puts a copy of a clip value (fresh ids) on a lane at a beat: *Paste*, and a session clip dropped on another track's lane. */
export const pasteClipOnLane = (clip: Clip | AudioClip, trackId: string, beat: number): void =>
  useProjectStore.getState().addArrangementClip(trackId, beat, clipCopyFor(project(), clip, trackId))

/** A track's lane on the arrangement timeline, at the beat that was clicked. */
export const laneActions: readonly Action<LaneSubject>[] = [
  {
    id: 'lane.add-clip',
    title: 'Add clip',
    group: 'edit',
    applies: ({ trackId }) => sessionClips(trackId).length > 0,
    choices: ({ trackId }) => sessionClips(trackId).map((clip) => ({ id: clip.id, title: clip.name })),
    run: ({ trackId, beat }, _context, clipId) => {
      const clip = sessionClips(trackId).find((candidate) => candidate.id === clipId)
      if (clip) useProjectStore.getState().addArrangementClip(trackId, beat, clip)
    },
  },
  {
    id: 'lane.paste',
    title: 'Paste',
    group: 'clipboard',
    enabled: ({ trackId }) => {
      const copied = clipClipboard.get()
      return !!copied && canPasteClipOnLane(copied.clip, trackId)
    },
    run: ({ trackId, beat }) => {
      const copied = clipClipboard.get()
      if (copied) pasteClipOnLane(copied.clip, trackId, beat)
    },
  },
  {
    id: 'lane.clear',
    title: 'Clear this track',
    group: 'delete',
    danger: true,
    enabled: ({ trackId }) => (project().arrangement ?? []).some((region) => region.trackId === trackId),
    run: ({ trackId }) => {
      const store = useProjectStore.getState()
      for (const region of arrangementOnTrack(store.project.arrangement ?? [], trackId)) store.removeArrangementClip(region.id)
    },
  },
]
