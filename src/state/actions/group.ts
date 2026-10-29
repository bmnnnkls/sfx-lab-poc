import { GROUP_COLOURS, type GroupColour, type TrackItem, findGroup, neighbourPlace, setGroupBus, tracksInGroup } from '@core'
import { openGroupEffects } from '../navigation'
import { useProjectStore } from '../project-store'
import { project } from './lookup'
import { renameAction } from './rename'
import type { Action, SubjectOf } from './types'

type GroupSubject = SubjectOf<'group'>

const groupOf = ({ groupId }: GroupSubject) => findGroup(project(), groupId)
const itemOf = ({ groupId }: GroupSubject): TrackItem => ({ kind: 'group', id: groupId })
const allHidden = (subject: GroupSubject) => tracksInGroup(project(), subject.groupId).every((track) => track.hidden)
const capitalized = (colour: GroupColour) => colour[0]!.toUpperCase() + colour.slice(1)

/** *Move up* or *Move down* for a track or a group: before the previous item or after the next one at its level. */
export const moveAction = <S extends SubjectOf<'track' | 'group'>>(
  kind: S['kind'],
  direction: -1 | 1,
  itemOf: (subject: S) => TrackItem,
  applies?: (subject: S) => boolean,
): Action<S> => ({
  id: `${kind}.move-${direction < 0 ? 'up' : 'down'}`,
  title: direction < 0 ? 'Move up' : 'Move down',
  group: 'edit',
  ...(applies && { applies }),
  enabled: (subject) => neighbourPlace(project(), itemOf(subject), direction) !== undefined,
  run: (subject) => {
    const item = itemOf(subject)
    const place = neighbourPlace(project(), item, direction)
    if (!place) return
    const store = useProjectStore.getState()
    if (item.kind === 'track') store.moveTrack(item.id, place)
    else store.moveGroup(item.id, place)
  },
})

/** A group of tracks: a folder, or a bus that sums them. */
export const groupActions: readonly Action<GroupSubject>[] = [
  {
    id: 'group.collapse',
    title: (subject) => (groupOf(subject)?.collapsed ? 'Expand' : 'Collapse'),
    group: 'open',
    applies: (subject) => groupOf(subject) !== undefined,
    run: (subject) => useProjectStore.getState().setGroupCollapsed(subject.groupId, !groupOf(subject)?.collapsed),
  },
  {
    id: 'group.open-effects',
    title: 'Open effects',
    group: 'open',
    applies: (subject) => groupOf(subject)?.bus !== undefined,
    run: (subject) => openGroupEffects(subject.groupId),
  },
  renameAction('group', (subject) => groupOf(subject) !== undefined),
  {
    id: 'group.bus',
    title: (subject) => (groupOf(subject)?.bus ? 'Remove bus' : 'Sum to a bus'),
    tooltip: (subject) =>
      groupOf(subject)?.bus
        ? "Send the group's tracks to the next bus out again, and discard the bus's effects"
        : "Sum the group's tracks into a bus with its own fader, effects and sends",
    group: 'edit',
    applies: (subject) => groupOf(subject) !== undefined,
    // Refused when the bus would make the mix loop.
    enabled: (subject) => setGroupBus(project(), subject.groupId, !groupOf(subject)?.bus) !== project(),
    run: (subject) => useProjectStore.getState().setGroupBus(subject.groupId, !groupOf(subject)?.bus),
  },
  {
    id: 'group.mute',
    title: (subject) => (groupOf(subject)?.muted ? 'Unmute' : 'Mute'),
    group: 'edit',
    applies: (subject) => groupOf(subject) !== undefined,
    run: (subject) => useProjectStore.getState().setGroupMuted(subject.groupId, !groupOf(subject)?.muted),
  },
  {
    id: 'group.solo',
    title: (subject) => (groupOf(subject)?.soloed ? 'Unsolo' : 'Solo'),
    group: 'edit',
    applies: (subject) => groupOf(subject) !== undefined,
    run: (subject) => useProjectStore.getState().setGroupSoloed(subject.groupId, !groupOf(subject)?.soloed),
  },
  {
    id: 'group.colour',
    title: 'Colour',
    group: 'edit',
    applies: (subject) => groupOf(subject) !== undefined,
    choices: (subject) => GROUP_COLOURS.map((colour) => ({ id: colour, title: capitalized(colour), enabled: groupOf(subject)?.colour !== colour })),
    run: (subject, _context, choice) => {
      if (GROUP_COLOURS.includes(choice as GroupColour)) useProjectStore.getState().setGroupColour(subject.groupId, choice as GroupColour)
    },
  },
  moveAction<GroupSubject>('group', -1, itemOf, (subject) => groupOf(subject) !== undefined),
  moveAction<GroupSubject>('group', 1, itemOf, (subject) => groupOf(subject) !== undefined),
  {
    id: 'group.hide',
    title: (subject) => (allHidden(subject) ? 'Show tracks' : 'Hide tracks'),
    group: 'edit',
    applies: (subject) => groupOf(subject) !== undefined,
    run: (subject) => useProjectStore.getState().setGroupHidden(subject.groupId, !allHidden(subject)),
  },
  {
    id: 'group.ungroup',
    title: 'Ungroup',
    group: 'edit',
    applies: (subject) => groupOf(subject) !== undefined,
    run: (subject) => useProjectStore.getState().ungroup(subject.groupId),
  },
  {
    id: 'group.delete',
    title: 'Delete group and tracks',
    group: 'delete',
    danger: true,
    applies: (subject) => groupOf(subject) !== undefined,
    run: (subject) => useProjectStore.getState().removeGroup(subject.groupId),
  },
]
