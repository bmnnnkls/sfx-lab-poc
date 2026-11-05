import { type ControlTarget, MAX_PINS, MAX_TRACKS, type TrackGraph, canGroupTrack, canMoveTrack, canPin, isPinned, pinKey, trackRows } from '@core'
import { openTrackView, revealPin } from '../navigation'
import { useProjectStore } from '../project-store'
import { useRecordStore } from '../record-store'
import { useSelectionStore } from '../selection-store'
import { showAutomation } from './control'
import { moveAction } from './group'
import { saveEffectsAction, saveToLibrary } from './library-save'
import { project, trackOf } from './lookup'
import { GRAPH_TITLES, graphChoices, pinLimitNote } from './pin'
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

/** The graphs of a track that have a front panel: an instrument's three, an audio or return track's effects. */
const graphsOf = ({ trackId }: TrackSubject): readonly TrackGraph[] => {
  const kind = trackOf(trackId)?.kind
  return kind === 'instrument' ? ['patch', 'fx', 'notes'] : kind ? ['fx'] : []
}
const pinOf = (trackId: string, graph: TrackGraph) => ({ owner: { kind: 'track' as const, trackId }, graph })
const unpinned = (subject: TrackSubject) => graphsOf(subject).filter((graph) => !isPinned(project(), pinOf(subject.trackId, graph)))
const pinned = (subject: TrackSubject) => graphsOf(subject).filter((graph) => isPinned(project(), pinOf(subject.trackId, graph)))
const isGraph = (subject: TrackSubject, choice: string | undefined): choice is TrackGraph => graphsOf(subject).includes(choice as TrackGraph)

/** Whether an instrument's note graph has anything between its clips and its instrument. */
const hasNoteEffects = (trackId: string) => {
  const track = trackOf(trackId)
  return track?.kind === 'instrument' && track.noteGraph.nodes.some((node) => node.type !== 'clipNotes' && node.type !== 'noteOut')
}

const volume = (trackId: string): ControlTarget => ({ kind: 'mixer', owner: { kind: 'track', trackId }, control: 'volume' })

/** What arming does, for the arm buttons and the menu entry. */
export const ARM_TOOLTIP = 'Arm for recording: an armed track hears the keyboard, records into a slot you press ● on, and with ● Rec on records into the Arrangement'

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
    id: 'track.pin',
    title: () => `Pin panel${pinLimitNote()}`,
    group: 'open',
    applies: (subject) => unpinned(subject).length > 0,
    enabled: () => (project().pins?.length ?? 0) < MAX_PINS,
    // An audio or return track has one panel: one entry, *Pin effects panel*.
    choices: (subject) =>
      graphsOf(subject).length === 1
        ? [{ id: 'fx', title: `Pin effects panel${pinLimitNote()}` }]
        : graphChoices(graphsOf(subject), (graph) => canPin(project(), pinOf(subject.trackId, graph))),
    inline: (subject) => graphsOf(subject).length === 1,
    run: (subject, _context, choice) => {
      if (isGraph(subject, choice)) revealPin(pinOf(subject.trackId, choice))
    },
  },
  {
    id: 'track.unpin',
    title: 'Unpin panel',
    group: 'open',
    applies: (subject) => pinned(subject).length > 0,
    choices: (subject) => {
      const graphs = pinned(subject)
      return graphs.length === 1 ? [{ id: graphs[0]!, title: `Unpin ${GRAPH_TITLES[graphs[0]!].toLowerCase()} panel` }] : graphChoices(graphs, () => true)
    },
    inline: (subject) => pinned(subject).length === 1,
    run: (subject, _context, choice) => {
      if (isGraph(subject, choice)) useProjectStore.getState().unpinPanel(pinKey(pinOf(subject.trackId, choice)))
    },
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
    verb: 'duplicate',
    title: 'Duplicate',
    group: 'edit',
    enabled: () => project().tracks.length < MAX_TRACKS,
    run: ({ trackId }) => {
      const copy = useProjectStore.getState().duplicateTrack(trackId)
      if (copy) useSelectionStore.getState().selectTrack(copy)
    },
  },
  {
    id: 'track.save-to-library',
    title: 'Save to library',
    group: 'edit',
    applies: (subject) => kindOf(subject) === 'instrument',
    choices: ({ trackId }) => [
      { id: 'patch', title: 'Instrument + notes' },
      { id: 'fx', title: 'Audio effects' },
      { id: 'notes', title: 'Note effects', enabled: hasNoteEffects(trackId) },
    ],
    run: ({ trackId }, context, choice) => {
      if (choice === 'patch' || choice === 'fx' || choice === 'notes') return saveToLibrary({ kind: 'asset', scope: { owner: { kind: 'track', trackId }, domain: choice } }, context)
    },
  },
  saveEffectsAction<TrackSubject>('track.save-effects-to-library', ({ trackId }) => ({ kind: 'track', trackId }), (subject) => kindOf(subject) === 'audio' || kindOf(subject) === 'return'),
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
    id: 'track.arm',
    title: ({ trackId }) => (useRecordStore.getState().armed.includes(trackId) ? 'Disarm' : 'Arm for recording'),
    group: 'edit',
    applies: (subject) => kindOf(subject) === 'instrument',
    tooltip: () => ARM_TOOLTIP,
    run: ({ trackId }) => useRecordStore.getState().arm(trackId, !useRecordStore.getState().armed.includes(trackId)),
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
    verb: 'delete',
    title: 'Delete',
    group: 'delete',
    danger: true,
    run: ({ trackId }) => useProjectStore.getState().removeTrack(trackId),
  },
]
