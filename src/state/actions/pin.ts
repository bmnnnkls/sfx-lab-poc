import { MAX_PINS, type PanelPin, type TrackGraph, canPin, isPinned, movePin, pinKey, pinnedGraph } from '@core'
import { openPinnedEditor, revealPin } from '../navigation'
import { useProjectStore } from '../project-store'
import { project } from './lookup'
import type { Action, ActionChoice, SubjectOf } from './types'

type PinSubject = SubjectOf<'pin'>

const pinOf = (subject: PinSubject): PanelPin | undefined => project().pins?.find((pin) => pinKey(pin) === pinKey(subject))

/** What *Pin* says when no more can be pinned. */
export const pinLimitNote = (): string => ((project().pins?.length ?? 0) >= MAX_PINS ? ` — ${MAX_PINS} panels are pinned` : '')

/** A graph's name in pin entries: *Instrument*, *Effects*, *Notes*. */
export const GRAPH_TITLES: Readonly<Record<TrackGraph, string>> = { patch: 'Instrument', fx: 'Effects', notes: 'Notes' }

/** *Pin effects panel* or *Unpin effects panel* for an owner with only an effects graph: a group's bus or the master. */
export const effectsPinAction = <S extends SubjectOf<'group' | 'master'>>(
  id: string,
  pinFor: (subject: S) => Pick<PanelPin, 'owner' | 'graph'>,
  applies?: (subject: S) => boolean,
): Action<S> => ({
  id,
  title: (subject) => (isPinned(project(), pinFor(subject)) ? 'Unpin effects panel' : `Pin effects panel${pinLimitNote()}`),
  group: 'open',
  ...(applies && { applies }),
  enabled: (subject) => isPinned(project(), pinFor(subject)) || canPin(project(), pinFor(subject)),
  run: (subject) => {
    const pin = pinFor(subject)
    if (isPinned(project(), pin)) useProjectStore.getState().unpinPanel(pinKey(pin))
    else revealPin(pin)
  },
})

/** Each graph of a track as a choice. */
export const graphChoices = (graphs: readonly TrackGraph[], enabled: (graph: TrackGraph) => boolean): ActionChoice[] =>
  graphs.map((graph) => ({ id: graph, title: GRAPH_TITLES[graph], enabled: enabled(graph) }))

const move = (direction: -1 | 1): Action<PinSubject> => ({
  id: `pin.move-${direction < 0 ? 'up' : 'down'}`,
  title: direction < 0 ? 'Move up' : 'Move down',
  group: 'edit',
  applies: (subject) => pinOf(subject) !== undefined,
  enabled: (subject) => movePin(project(), pinKey(subject), direction) !== project(),
  run: (subject) => useProjectStore.getState().movePin(pinKey(subject), direction),
})

/** A pinned front panel in the Pinned view. */
export const pinActions: readonly Action<PinSubject>[] = [
  {
    id: 'pin.open',
    title: 'Open',
    tooltip: () => 'Open the full editor',
    group: 'open',
    applies: (subject) => pinnedGraph(project(), subject) !== undefined,
    run: (subject) => openPinnedEditor(subject),
  },
  {
    id: 'pin.collapse',
    title: (subject) => (pinOf(subject)?.collapsed ? 'Expand' : 'Collapse'),
    group: 'open',
    applies: (subject) => pinOf(subject) !== undefined,
    run: (subject) => useProjectStore.getState().setPinCollapsed(pinKey(subject), !pinOf(subject)?.collapsed),
  },
  move(-1),
  move(1),
  {
    id: 'pin.unpin',
    title: 'Unpin',
    group: 'delete',
    applies: (subject) => pinOf(subject) !== undefined,
    run: (subject) => useProjectStore.getState().unpinPanel(pinKey(subject)),
  },
]
