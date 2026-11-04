import { MAX_ARRANGEMENT_MARKERS } from '@core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useArrangementView } from '../arrangement-view-store'
import { useProjectStore } from '../project-store'
import { useRenameStore } from '../rename-store'
import { useStatusStore } from '../status-store'
import { commitRename, describeActions, runAction, subjectName, type Subject } from '.'
import { fakeContext, loadDemo } from './test-support'

const store = () => useProjectStore.getState()
const project = () => store().project
const items = (subject: Subject) => describeActions(subject, fakeContext())
const item = (subject: Subject, id: string) => items(subject).find((entry) => entry.id === id)
const undoSteps = () => store().history.past.length

beforeEach(() => {
  loadDemo()
  useArrangementView.getState().setPosition(0)
  useRenameStore.getState().stop()
})
afterEach(() => useStatusStore.setState({ status: null }))

describe('a marker', () => {
  it('goes to its beat, and jumps playback there while the arrangement plays', () => {
    const markerId = store().addArrangementMarker(8)!
    const context = fakeContext()
    runAction('arrangement-marker.go-to', { kind: 'arrangement-marker', markerId }, context)
    expect(useArrangementView.getState().position).toBe(8)
    expect(context.calls).toEqual([])
    useStatusStore.setState({ status: { playing: true, mode: 'arrangement' } as never })
    runAction('arrangement-marker.go-to', { kind: 'arrangement-marker', markerId }, context)
    expect(context.calls).toEqual(['engine.playArrangement(8)'])
  })

  it('loops to the next marker, which the last one cannot', () => {
    const first = store().addArrangementMarker(4)!
    const last = store().addArrangementMarker(12)!
    expect(item({ kind: 'arrangement-marker', markerId: last }, 'arrangement-marker.loop-to-next')!.enabled).toBe(false)
    runAction('arrangement-marker.loop-to-next', { kind: 'arrangement-marker', markerId: first }, fakeContext())
    expect(project().arrangementLoop).toEqual({ from: 4, to: 12 })
  })

  it('renames in the arrangement, one undo step, and deletes', () => {
    const markerId = store().addArrangementMarker(4)!
    const subject: Subject = { kind: 'arrangement-marker', markerId }
    runAction('arrangement-marker.rename', subject, fakeContext())
    expect(useRenameStore.getState().renaming).toEqual({ subject, origin: 'arrangement' })
    const before = undoSteps()
    commitRename(subject, '  Verse ', fakeContext())
    expect(project().arrangementMarkers![0]!.name).toBe('Verse')
    expect(undoSteps()).toBe(before + 1)
    expect(subjectName(subject)).toBe('Marker Verse')
    runAction('arrangement-marker.delete', subject, fakeContext())
    expect(project().arrangementMarkers).toBeUndefined()
    expect(items(subject)).toEqual([])
  })

  it('is named after itself, without saying Marker twice', () => {
    const markerId = store().addArrangementMarker(4)!
    expect(subjectName({ kind: 'arrangement-marker', markerId })).toBe('Marker 1')
    expect(subjectName({ kind: 'arrangement-marker', markerId: 'gone' })).toBe('Marker')
  })
})

describe('the loop brace', () => {
  it('shows nothing without a brace', () => {
    expect(items({ kind: 'arrangement-loop' })).toEqual([])
  })

  it('turns looping on and off without an undo step, zooms to itself, and is removed in one', () => {
    store().setArrangementLoop({ from: 16, to: 20 })
    const subject: Subject = { kind: 'arrangement-loop' }
    expect(subjectName(subject)).toBe('Loop 5.1 – 6.1')
    const before = undoSteps()
    expect(item(subject, 'arrangement-loop.toggle')!.title).toBe('Loop')
    runAction('arrangement-loop.toggle', subject, fakeContext())
    expect(project().arrangementLoop!.enabled).toBe(true)
    expect(item(subject, 'arrangement-loop.toggle')!.title).toBe('Stop looping')
    expect(undoSteps()).toBe(before)
    runAction('arrangement-loop.zoom', subject, fakeContext())
    expect(useArrangementView.getState().zoomTo).toEqual({ from: 16, to: 20 })
    runAction('arrangement-loop.remove', subject, fakeContext())
    expect(project().arrangementLoop).toBeUndefined()
    expect(undoSteps()).toBe(before + 1)
  })
})

describe('the timeline', () => {
  it('adds a marker at the beat, until the limit', () => {
    const subject: Subject = { kind: 'arrangement-timeline', beat: 6 }
    expect(subjectName(subject)).toBe('Timeline at 2.3')
    runAction('arrangement-timeline.add-marker', subject, fakeContext())
    expect(project().arrangementMarkers!.map((marker) => [marker.beat, marker.name])).toEqual([[6, 'Marker 1']])
    for (let index = 1; index < MAX_ARRANGEMENT_MARKERS; index++) store().addArrangementMarker(index)
    expect(item(subject, 'arrangement-timeline.add-marker')!.enabled).toBe(false)
  })

  it('loops only with a brace', () => {
    const subject: Subject = { kind: 'arrangement-timeline', beat: 0 }
    expect(item(subject, 'arrangement-timeline.loop')!.enabled).toBe(false)
    store().setArrangementLoop({ from: 0, to: 4 })
    expect(item(subject, 'arrangement-timeline.loop')!.enabled).toBe(true)
    runAction('arrangement-timeline.loop', subject, fakeContext())
    expect(project().arrangementLoop!.enabled).toBe(true)
    expect(item(subject, 'arrangement-timeline.loop')!.title).toBe('Stop looping')
  })
})

describe('a region', () => {
  it('sets the loop over itself, to where it stops sounding', () => {
    const bass = project().tracks[0]!
    const clip = bass.kind === 'instrument' ? bass.clips[0]! : null
    store().addArrangementClip(bass.id, 8, clip!)
    const region = project().arrangement![0]!
    store().updateArrangementClip(region.id, { loop: true })
    store().addArrangementClip(bass.id, 20, clip!)
    expect(item({ kind: 'region', regionId: region.id }, 'region.set-loop')!.title).toBe('Set loop to region')
    runAction('region.set-loop', { kind: 'region', regionId: region.id }, fakeContext())
    expect(project().arrangementLoop).toEqual({ from: 8, to: 20 })
  })
})
