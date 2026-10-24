import { openClip } from '../navigation'
import { useProjectStore } from '../project-store'
import { trackOf } from './lookup'
import type { Action, SubjectOf } from './types'

type SlotSubject = SubjectOf<'slot'>

const isEmpty = ({ trackId, scene }: SlotSubject) => {
  const track = trackOf(trackId)
  return !!track && track.kind !== 'return' && !track.clips[scene]
}

/** An empty cell of the session grid, on an instrument or audio track. */
export const slotActions: readonly Action<SlotSubject>[] = [
  {
    id: 'slot.create-clip',
    title: 'Create clip',
    group: 'edit',
    applies: (subject) => isEmpty(subject) && trackOf(subject.trackId)?.kind === 'instrument',
    run: ({ trackId, scene }) => openClip(trackId, useProjectStore.getState().createClip(trackId, scene).id),
  },
]
