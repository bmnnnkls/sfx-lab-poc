import { type ControlTarget, MAX_TRACKS, canGroupTrack, canMoveTrack, trackRows } from '@core'
import { openTrackView } from '../navigation'
import { useProjectStore } from '../project-store'
import { useSelectionStore } from '../selection-store'
import { showAutomation } from './control'
import { moveAction } from './group'
import { project, trackOf } from './lookup'
import { renameAction } from './rename'
import type { Action, ActionChoice, SubjectOf } from './types'

type TrackSubject = SubjectOf<'track'>

const kindOf = ({ trackId }: TrackSubject) => trackOf(trackId)?.kind
const isClipTrack = (subject: TrackSubject) => kindOf(subject) === 'instrument' || kindOf(subject) === 'audio'

/** *Move to group*'s choice that takes a track out of its groups. */
const NO_GROUP = '-'

/** Each group as a choice, named by its path ("Drums / Kicks") in the order the tree draws them, then *No group*. */
const groupChoices = ({ trackId }: TrackSubject): ActionChoice[] => {
  const groupId = trackOf(trackId)?.groupId
  const path: string[] = []
  const choices: ActionChoice[] = []
  for (const row of trackRows(project())) {
    if (row.kind !== 'group') continue
    path.length = row.depth
    path.push(row.group.name)
    // A group whose bus the track would make loop is refused, as a drag there is.
    choices.push({ id: row.group.id, title: path.join(' / '), enabled: groupId !== row.group.id && canMoveTrack(project(), trackId, { inside: row.group.id }) })
  }
  if (groupId) choices.push({ id: NO_GROUP, title: 'No group' })
  return choices
}

/** The top-level group a track is in. */
const outermostGroup = (trackId: string) =>
  trackRows(project()).find((row) => row.kind === 'group' && row.depth === 0 && row.trackIds.includes(trackId))

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
    id: 'track.group',
    title: 'Group',
    group: 'edit',
    applies: isClipTrack,
    enabled: ({ trackId }) => canGroupTrack(project(), trackId),
    run: ({ trackId }) => {
      useProjectStore.getState().groupTrack(trackId)
    },
  },
  {
    id: 'track.move-to-group',
    title: 'Move to group',
    group: 'edit',
    applies: isClipTrack,
    enabled: () => (project().groups?.length ?? 0) > 0,
    choices: groupChoices,
    run: ({ trackId }, _context, choice) => {
      const store = useProjectStore.getState()
      if (choice !== NO_GROUP) {
        if (choice) store.moveTrack(trackId, { inside: choice })
        return
      }
      const outer = outermostGroup(trackId)
      if (outer?.kind === 'group') store.moveTrack(trackId, { after: { kind: 'group', id: outer.group.id } })
    },
  },
  moveAction<TrackSubject>('track', -1, ({ trackId }) => ({ kind: 'track', id: trackId }), (subject) => kindOf(subject) !== undefined),
  moveAction<TrackSubject>('track', 1, ({ trackId }) => ({ kind: 'track', id: trackId }), (subject) => kindOf(subject) !== undefined),
  {
    id: 'track.hide',
    title: ({ trackId }) => (trackOf(trackId)?.hidden ? 'Show' : 'Hide'),
    group: 'edit',
    applies: (subject) => kindOf(subject) !== undefined,
    run: ({ trackId }) => useProjectStore.getState().setTrackHidden(trackId, !trackOf(trackId)?.hidden),
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
