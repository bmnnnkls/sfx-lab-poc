import { canPasteSessionClip } from '@core'
import { useLayoutStore } from '../layout-store'
import { openClip } from '../navigation'
import { useProjectStore } from '../project-store'
import { clipClipboard } from './clipboards'
import { project, trackOf } from './lookup'
import type { Action, SubjectOf } from './types'

type SlotSubject = SubjectOf<'slot'>

const isEmpty = ({ trackId, scene }: SlotSubject) => {
  const track = trackOf(trackId)
  return !!track && track.kind !== 'return' && !track.clips[scene]
}

/** The choice that offers to import samples when the project has none. */
const IMPORT = ''

/** An empty cell of the session grid, on an instrument or audio track. */
export const slotActions: readonly Action<SlotSubject>[] = [
  {
    id: 'slot.create-clip',
    title: 'Create clip',
    group: 'edit',
    applies: (subject) => isEmpty(subject) && trackOf(subject.trackId)?.kind === 'instrument',
    run: ({ trackId, scene }) => openClip(trackId, useProjectStore.getState().createClip(trackId, scene).id),
  },
  {
    id: 'slot.add-audio-clip',
    title: 'Add audio clip',
    group: 'edit',
    applies: (subject) => isEmpty(subject) && trackOf(subject.trackId)?.kind === 'audio',
    choices: () => {
      const samples = project().samples
      return samples.length === 0 ? [{ id: IMPORT, title: 'Import samples…' }] : samples.map((sample) => ({ id: sample.id, title: sample.name }))
    },
    run: ({ trackId, scene }, _context, sampleId) => {
      const sample = project().samples.find((candidate) => candidate.id === sampleId)
      if (!sample) {
        useLayoutStore.getState().revealView('samples')
        return
      }
      useProjectStore.getState().createAudioClip(trackId, scene, sample)
      const track = trackOf(trackId)
      const added = track?.kind === 'audio' ? track.clips[scene] : null
      if (added) openClip(trackId, added.id)
    },
  },
  {
    id: 'slot.paste',
    title: 'Paste',
    group: 'clipboard',
    applies: isEmpty,
    enabled: ({ trackId, scene }) => {
      const copied = clipClipboard.get()
      return !!copied && canPasteSessionClip(project(), copied.clip, trackId, scene)
    },
    run: ({ trackId, scene }) => {
      const copied = clipClipboard.get()
      if (copied) useProjectStore.getState().pasteClip(copied.clip, trackId, scene)
    },
  },
]
