import { type ControlTarget, MAX_TRACKS } from '@core'
import { openTrackView } from '../navigation'
import { useProjectStore } from '../project-store'
import { useSelectionStore } from '../selection-store'
import { showAutomation } from './control'
import { project, trackOf } from './lookup'
import { renameAction } from './rename'
import type { Action, SubjectOf } from './types'

type TrackSubject = SubjectOf<'track'>

const kindOf = ({ trackId }: TrackSubject) => trackOf(trackId)?.kind
const volume = (trackId: string): ControlTarget => ({ kind: 'mixer', owner: { kind: 'track', trackId }, control: 'volume' })

/** An instrument, audio or return track. */
export const trackActions: readonly Action<TrackSubject>[] = [
  {
    id: 'track.stop',
    title: 'Stop',
    group: 'open',
    applies: (subject) => kindOf(subject) === 'instrument' || kindOf(subject) === 'audio',
    run: ({ trackId }, { engine }) => engine.stopTrack(trackId),
  },
  {
    id: 'track.open-instrument',
    title: 'Open instrument',
    group: 'open',
    applies: (subject) => kindOf(subject) === 'instrument',
    run: ({ trackId }) => openTrackView(trackId, 'instrument'),
  },
  {
    id: 'track.open-effects',
    title: 'Open effects',
    group: 'open',
    applies: (subject) => kindOf(subject) !== undefined,
    run: ({ trackId }) => openTrackView(trackId, 'effects'),
  },
  {
    id: 'track.open-notes',
    title: 'Open notes',
    group: 'open',
    applies: (subject) => kindOf(subject) === 'instrument',
    run: ({ trackId }) => openTrackView(trackId, 'notes'),
  },
  {
    id: 'track.show-automation',
    title: 'Show automation',
    group: 'open',
    applies: (subject) => kindOf(subject) !== undefined,
    // A track's lanes live in its clips; a return's in its slots, which this creates.
    enabled: ({ trackId }) => {
      const track = trackOf(trackId)
      return !!track && (track.kind === 'return' || track.clips.some(Boolean))
    },
    run: ({ trackId }) => showAutomation(volume(trackId)),
  },
  renameAction('track'),
  {
    id: 'track.duplicate',
    title: 'Duplicate',
    group: 'edit',
    enabled: () => project().tracks.length < MAX_TRACKS,
    run: ({ trackId }) => {
      const copy = useProjectStore.getState().duplicateTrack(trackId)
      if (copy) useSelectionStore.getState().selectTrack(copy)
    },
  },
  {
    id: 'track.mute',
    title: ({ trackId }) => (trackOf(trackId)?.muted ? 'Unmute' : 'Mute'),
    group: 'edit',
    run: ({ trackId }) => useProjectStore.getState().setTrackMuted(trackId, !trackOf(trackId)?.muted),
  },
  {
    id: 'track.solo',
    title: ({ trackId }) => (trackOf(trackId)?.soloed ? 'Unsolo' : 'Solo'),
    group: 'edit',
    run: ({ trackId }) => useProjectStore.getState().setTrackSoloed(trackId, !trackOf(trackId)?.soloed),
  },
  {
    id: 'track.delete',
    title: 'Delete',
    group: 'delete',
    danger: true,
    run: ({ trackId }) => useProjectStore.getState().removeTrack(trackId),
  },
]
