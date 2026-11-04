import { MAX_ARRANGEMENT_MARKERS, nextArrangementMarker } from '@core'
import { setArrangementPosition } from '../arrangement-transport'
import { useArrangementView } from '../arrangement-view-store'
import { useProjectStore } from '../project-store'
import { project } from './lookup'
import { renameAction } from './rename'
import type { Action, SubjectOf } from './types'

type MarkerSubject = SubjectOf<'arrangement-marker'>
type LoopSubject = SubjectOf<'arrangement-loop'>
type TimelineSubject = SubjectOf<'arrangement-timeline'>

const markerOf = ({ markerId }: MarkerSubject) => project().arrangementMarkers?.find((marker) => marker.id === markerId)
const loopOf = () => project().arrangementLoop

/** What a marker is called on its own: *Marker Verse*, but a default name says it already (*Marker 2*). */
export const markerTitle = (name: string): string => (/^marker\b/i.test(name) ? name : `Marker ${name}`)

/** ⟳ *Loop*: on or off; without a brace, nothing. */
export const toggleArrangementLoop = (): void => {
  const loop = loopOf()
  if (loop) useProjectStore.getState().setArrangementLoopEnabled(loop.enabled !== true)
}

const loopTitle = () => (loopOf()?.enabled ? 'Stop looping' : 'Loop')

const markerActions: readonly Action<MarkerSubject>[] = [
  {
    id: 'arrangement-marker.go-to',
    title: 'Go to',
    group: 'open',
    tooltip: () => 'Put the position at the marker',
    run: (subject, { engine }) => {
      const marker = markerOf(subject)
      if (marker) setArrangementPosition(engine, marker.beat)
    },
  },
  renameAction('arrangement-marker'),
  {
    id: 'arrangement-marker.loop-to-next',
    title: 'Loop to next marker',
    group: 'edit',
    tooltip: (subject) => (nextArrangementMarker(project(), subject.markerId) ? 'Set the loop from this marker to the next' : 'This is the last marker'),
    enabled: (subject) => nextArrangementMarker(project(), subject.markerId) !== null,
    run: (subject) => {
      const marker = markerOf(subject)
      const next = nextArrangementMarker(project(), subject.markerId)
      if (marker && next) useProjectStore.getState().setArrangementLoop({ from: marker.beat, to: next.beat })
    },
  },
  {
    id: 'arrangement-marker.delete',
    verb: 'delete',
    title: 'Delete',
    group: 'delete',
    run: ({ markerId }) => useProjectStore.getState().removeArrangementMarker(markerId),
  },
]

/** A marker in the arrangement's mark lane, from its right-click menu, the palette and the edit keys. */
export const arrangementMarkerActions: readonly Action<MarkerSubject>[] = markerActions.map((action) => ({
  ...action,
  applies: (subject) => markerOf(subject) !== undefined,
}))

const loopActions: readonly Action<LoopSubject>[] = [
  {
    id: 'arrangement-loop.toggle',
    title: loopTitle,
    group: 'edit',
    tooltip: () => 'Arrangement playback repeats the brace (L)',
    run: toggleArrangementLoop,
  },
  {
    id: 'arrangement-loop.remove',
    verb: 'delete',
    title: 'Remove loop',
    group: 'delete',
    run: () => useProjectStore.getState().removeArrangementLoop(),
  },
  {
    id: 'arrangement-loop.zoom',
    title: 'Zoom to loop',
    group: 'view',
    run: () => {
      const loop = loopOf()
      if (loop) useArrangementView.getState().zoom({ from: loop.from, to: loop.to })
    },
  },
]

/** The loop brace in the arrangement's mark lane. */
export const arrangementLoopActions: readonly Action<LoopSubject>[] = loopActions.map((action) => ({
  ...action,
  applies: () => loopOf() !== undefined,
}))

/** The arrangement's timeline at a beat: the mark lane's empty space, and the focused timeline at the position. */
export const arrangementTimelineActions: readonly Action<TimelineSubject>[] = [
  {
    id: 'arrangement-timeline.add-marker',
    title: 'Add marker here',
    group: 'edit',
    enabled: () => (project().arrangementMarkers?.length ?? 0) < MAX_ARRANGEMENT_MARKERS,
    run: ({ beat }) => {
      useProjectStore.getState().addArrangementMarker(beat)
    },
  },
  {
    id: 'arrangement-timeline.loop',
    title: loopTitle,
    group: 'edit',
    tooltip: () => (loopOf() ? 'Arrangement playback repeats the brace (L)' : 'Draw a loop brace in the mark lane first'),
    enabled: () => loopOf() !== undefined,
    run: toggleArrangementLoop,
  },
]
