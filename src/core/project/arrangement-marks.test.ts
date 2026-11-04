import { describe, expect, it } from 'vitest'
import { createArrangementClip } from './arrangement-clip'
import {
  MAX_ARRANGEMENT_MARKERS,
  addArrangementMarker,
  arrangementContentEnd,
  arrangementStops,
  moveArrangementMarker,
  nextArrangementMarker,
  removeArrangementLoop,
  removeArrangementMarker,
  renameArrangementMarker,
  setArrangementLoop,
  setArrangementLoopEnabled,
} from './arrangement-marks'
import { createClip, createEmptyProject } from './edit'
import { MAX_TIMELINE_BEATS } from './limits'
import { withViewOf } from './track-groups'
import type { Project } from './types'

const empty = (): Project => createEmptyProject()
const names = (project: Project) => (project.arrangementMarkers ?? []).map((marker) => marker.name)
const beats = (project: Project) => (project.arrangementMarkers ?? []).map((marker) => marker.beat)

describe('arrangement markers', () => {
  it('adds a marker named after the lowest free n, keeping them in beat order', () => {
    let project = addArrangementMarker(empty(), 8, undefined, 'a')
    project = addArrangementMarker(project, 4, undefined, 'b')
    project = addArrangementMarker(project, 12, '  Chorus  ', 'c')
    expect(beats(project)).toEqual([4, 8, 12])
    expect(names(project)).toEqual(['Marker 2', 'Marker 1', 'Chorus'])
    project = removeArrangementMarker(project, 'a')
    expect(names(addArrangementMarker(project, 0))).toContain('Marker 1')
  })

  it.each([
    { what: 'before the start', beat: -3, expected: 0 },
    { what: 'past the timeline', beat: MAX_TIMELINE_BEATS + 10, expected: MAX_TIMELINE_BEATS },
    { what: 'not a number', beat: Number.NaN, expected: 0 },
  ])('keeps a marker added or moved $what inside the timeline', ({ beat, expected }) => {
    const added = addArrangementMarker(empty(), beat, undefined, 'a')
    expect(beats(added)).toEqual([expected])
    expect(beats(moveArrangementMarker(addArrangementMarker(empty(), 5, undefined, 'a'), 'a', beat))).toEqual([expected])
  })

  it('adds nothing at the limit', () => {
    let project = empty()
    for (let index = 0; index < MAX_ARRANGEMENT_MARKERS; index++) project = addArrangementMarker(project, index)
    expect(addArrangementMarker(project, 1)).toBe(project)
  })

  it('keeps the same project when nothing changes', () => {
    const project = addArrangementMarker(empty(), 4, 'Verse', 'a')
    expect(moveArrangementMarker(project, 'a', 4)).toBe(project)
    expect(moveArrangementMarker(project, 'missing', 9)).toBe(project)
    expect(renameArrangementMarker(project, 'a', 'Verse')).toBe(project)
    expect(renameArrangementMarker(project, 'a', '   ')).toBe(project)
    expect(removeArrangementMarker(project, 'missing')).toBe(project)
  })

  it('moves a marker past another, keeping the order', () => {
    let project = addArrangementMarker(addArrangementMarker(empty(), 4, 'A', 'a'), 8, 'B', 'b')
    project = moveArrangementMarker(project, 'a', 12)
    expect(names(project)).toEqual(['B', 'A'])
    expect(nextArrangementMarker(project, 'b')!.id).toBe('a')
    expect(nextArrangementMarker(project, 'a')).toBeNull()
  })

  it('drops the field with the last marker', () => {
    const project = removeArrangementMarker(addArrangementMarker(empty(), 4, 'A', 'a'), 'a')
    expect(project).not.toHaveProperty('arrangementMarkers')
  })
})

describe('the arrangement loop', () => {
  it.each([
    { what: 'in order', range: { from: 4, to: 8 }, expected: { from: 4, to: 8 } },
    { what: 'reversed', range: { from: 8, to: 4 }, expected: { from: 4, to: 8 } },
    { what: 'under a beat', range: { from: 4, to: 4.25 }, expected: { from: 4, to: 5 } },
    { what: 'empty at the end', range: { from: MAX_TIMELINE_BEATS, to: MAX_TIMELINE_BEATS }, expected: { from: MAX_TIMELINE_BEATS - 1, to: MAX_TIMELINE_BEATS } },
    { what: 'outside the timeline', range: { from: -4, to: MAX_TIMELINE_BEATS + 4 }, expected: { from: 0, to: MAX_TIMELINE_BEATS } },
  ])('sets a range $what', ({ range, expected }) => {
    expect(setArrangementLoop(empty(), range).arrangementLoop).toEqual(expected)
  })

  it('keeps whether it is on when the range changes, and is off when new', () => {
    const on = setArrangementLoopEnabled(setArrangementLoop(empty(), { from: 0, to: 4 }), true)
    expect(on.arrangementLoop).toEqual({ from: 0, to: 4, enabled: true })
    expect(setArrangementLoop(on, { from: 2, to: 6 }).arrangementLoop).toEqual({ from: 2, to: 6, enabled: true })
    expect(setArrangementLoopEnabled(on, false).arrangementLoop).toEqual({ from: 0, to: 4 })
  })

  it('keeps the same project when nothing changes', () => {
    const project = setArrangementLoop(empty(), { from: 0, to: 4 })
    expect(setArrangementLoop(project, { from: 4, to: 0 })).toBe(project)
    expect(setArrangementLoopEnabled(project, false)).toBe(project)
    expect(setArrangementLoopEnabled(empty(), true).arrangementLoop).toBeUndefined()
    const none = empty()
    expect(removeArrangementLoop(none)).toBe(none)
    expect(removeArrangementLoop(project)).not.toHaveProperty('arrangementLoop')
  })

  it('is a view field for undo: restoring a range keeps the current toggle', () => {
    const before = setArrangementLoop(empty(), { from: 0, to: 4 })
    const after = setArrangementLoopEnabled(setArrangementLoop(before, { from: 0, to: 8 }), true)
    expect(withViewOf(before, after).arrangementLoop).toEqual({ from: 0, to: 4, enabled: true })
    expect(withViewOf(empty(), after).arrangementLoop).toBeUndefined()
  })
})

describe('the content end and the stops', () => {
  it('is the last of the regions, the loop and the markers', () => {
    const track = 't'
    const region = createArrangementClip(track, 4, createClip('A', 4))
    let project: Project = { ...empty(), arrangement: [region] }
    expect(arrangementContentEnd(empty())).toBe(0)
    expect(arrangementContentEnd(project)).toBe(8)
    project = setArrangementLoop(project, { from: 2, to: 12 })
    expect(arrangementContentEnd(project)).toBe(12)
    project = addArrangementMarker(project, 20)
    expect(arrangementContentEnd(project)).toBe(20)
  })

  it('steps through markers and the loop edges, each once', () => {
    let project = addArrangementMarker(addArrangementMarker(empty(), 4), 16)
    project = setArrangementLoop(project, { from: 4, to: 8 })
    expect(arrangementStops(project)).toEqual([4, 8, 16])
  })
})
