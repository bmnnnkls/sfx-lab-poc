import { type ArrangementClip, type AudioClip, type Clip, arrangementEnd, commit, copySessionClip } from '@core'
import { useAutomationEditor } from '../automation-store'
import { openClip } from '../navigation'
import { useProjectStore } from '../project-store'
import { useStatusStore } from '../status-store'
import { sessionClipOf, trackOf } from './lookup'
import { clipClipboard } from './clipboards'
import { renameAction } from './rename'
import type { Action, SubjectOf } from './types'

type ClipSubject = SubjectOf<'clip'>

/** Copies a session clip into the first empty slot of its own track. */
export const duplicateSessionClip = (trackId: string, clipId: string) => {
  const store = useProjectStore.getState(), track = store.project.tracks.find((t) => t.id === trackId)
  if (!track || track.kind === 'return') return
  const scene = track.clips.findIndex((clip) => !clip)
  if (scene < 0) return
  const project = copySessionClip(store.project, trackId, clipId, trackId, scene)
  if (project !== store.project) useProjectStore.setState({ project, history: commit(store.history, project, { now: Date.now() }) })
}

/**
 * Places a copy of a session clip on the arrangement timeline of its own track: at the end of the
 * track's regions (or beat 0 when it has none). Dragging a slot onto a lane places it at a beat;
 * this is the way from the keyboard, since a lane can't take the focus.
 */
export const placeOnArrangement = (trackId: string, clip: Clip | AudioClip): void => {
  const { addArrangementClip, project } = useProjectStore.getState()
  const endOf = (regions: readonly ArrangementClip[]): number =>
    Math.max(0, ...regions.filter((region) => region.trackId === trackId).map(arrangementEnd))
  addArrangementClip(trackId, endOf(project.arrangement ?? []), clip)
}

const copyClip = (trackId: string, clipId: string) => {
  const found = sessionClipOf(trackId, clipId)
  const kind = trackOf(trackId)?.kind
  if (found && kind && kind !== 'return') clipClipboard.set({ clip: found.clip, kind })
}

const deleteClip = ({ trackId, clipId }: ClipSubject) => {
  const found = sessionClipOf(trackId, clipId)
  if (!found) return
  const store = useProjectStore.getState()
  if (trackOf(trackId)?.kind === 'audio') store.deleteAudioClip(trackId, found.scene)
  else store.deleteClip(trackId, found.scene)
}

const playing = ({ trackId, clipId }: ClipSubject) => useStatusStore.getState().status?.tracks[trackId]?.playingClipId === clipId

/** A session clip, MIDI or audio. */
export const clipActions: readonly Action<ClipSubject>[] = [
  {
    id: 'clip.launch',
    title: (subject) => (playing(subject) ? 'Restart' : 'Launch'),
    group: 'open',
    run: ({ trackId, clipId }, { engine }) => engine.launchClip(trackId, clipId),
  },
  {
    id: 'clip.edit',
    title: ({ trackId }) => (trackOf(trackId)?.kind === 'audio' ? 'Edit clip' : 'Edit notes'),
    group: 'open',
    run: ({ trackId, clipId }) => openClip(trackId, clipId),
  },
  {
    id: 'clip.edit-automation',
    title: 'Edit automation',
    group: 'open',
    run: ({ trackId, clipId }) => {
      openClip(trackId, clipId)
      useAutomationEditor.getState().show()
    },
  },
  renameAction('clip'),
  {
    id: 'clip.duplicate',
    verb: 'duplicate',
    title: 'Duplicate to empty slot',
    group: 'edit',
    enabled: ({ trackId }) => {
      const track = trackOf(trackId)
      return !!track && track.kind !== 'return' && track.clips.some((clip) => !clip)
    },
    run: ({ trackId, clipId }) => duplicateSessionClip(trackId, clipId),
  },
  {
    id: 'clip.place-on-arrangement',
    title: 'Place on arrangement',
    group: 'edit',
    run: ({ trackId, clipId }) => {
      const found = sessionClipOf(trackId, clipId)
      if (found) placeOnArrangement(trackId, found.clip)
    },
  },
  {
    id: 'clip.copy',
    verb: 'copy',
    title: 'Copy',
    group: 'clipboard',
    run: ({ trackId, clipId }) => copyClip(trackId, clipId),
  },
  {
    id: 'clip.cut',
    verb: 'cut',
    title: 'Cut',
    group: 'clipboard',
    run: (subject) => {
      copyClip(subject.trackId, subject.clipId)
      deleteClip(subject)
    },
  },
  {
    id: 'clip.delete',
    verb: 'delete',
    title: 'Delete',
    group: 'delete',
    danger: true,
    run: (subject) => deleteClip(subject),
  },
]
