import { SAMPLE_MARK_LIMITS, type SampleInfo, addSamples, createDemoProject, moveMarker, originOf, setLoop } from '@core'
import { beforeEach, describe, expect, it } from 'vitest'
import { useProjectStore } from '../project-store'
import { useRenameStore } from '../rename-store'
import { type WaveSelection, useWaveEditorStore, waveViewOf } from '../wave-editor-store'
import { type Subject, commitRename, describeActions, runAction, runVerb, subjectName, verbTarget } from '.'
import { fakeContext } from './test-support'

/** 800 frames at 8 kHz. */
const PAD: SampleInfo = { id: 'pad', name: 'Pad', extension: 'wav', durationSeconds: 0.1, sampleRate: 8000, channels: 2, bytes: 1000 }
const selection: Subject = { kind: 'sample-selection', sampleId: PAD.id, pane: 'main' }
const key = `main:${originOf(PAD)}`

const sample = () => useProjectStore.getState().project.samples.find((candidate) => candidate.id === PAD.id)!
const view = () => waveViewOf(useWaveEditorStore.getState().views, key)
const undoSteps = () => useProjectStore.getState().history.past.length
const select = (range: WaveSelection | null) => useWaveEditorStore.getState().select(key, range)
const item = (subject: Subject, id: string) => describeActions(subject, fakeContext()).find((candidate) => candidate.id === id)
const listed = (subject: Subject) => describeActions(subject, fakeContext()).map((entry) => `${entry.group}: ${entry.title}`)
const load = (info: SampleInfo = PAD) => useProjectStore.getState().resetProject(addSamples(createDemoProject(), [info]))

beforeEach(() => {
  load()
  useWaveEditorStore.setState({ views: {} })
  useRenameStore.getState().stop()
})

describe('Add marker, Make region and Set loop', () => {
  it('add a marker at the cursor, one undo step, and F2 then renames it in place', () => {
    useWaveEditorStore.getState().setView(key, { cursor: 250 })
    const steps = undoSteps()
    runAction('sample-selection.add-marker', selection, fakeContext())
    expect(sample().markers).toEqual([expect.objectContaining({ frame: 250, name: 'Marker 1' })])
    expect(undoSteps()).toBe(steps + 1)
    const marker = sample().markers![0]!
    const context = fakeContext({ origin: 'wave' })
    expect(verbTarget('rename', [selection], context)?.action.id).toBe('sample-selection.rename-marker')
    expect(runVerb('rename', [selection], context)).toBe(true)
    expect(useRenameStore.getState().renaming).toEqual({ subject: { kind: 'sample-marker', sampleId: PAD.id, pane: 'main', markerId: marker.id }, origin: 'wave' })
    // Away from it, F2 has nothing to rename.
    useWaveEditorStore.getState().setView(key, { cursor: 251 })
    expect(verbTarget('rename', [selection], context)).toBeUndefined()
  })

  it('make a region and set the loop from the selection; without one they say why', () => {
    expect(item(selection, 'sample-selection.make-region')).toMatchObject({ enabled: false, tooltip: 'Select a part first' })
    expect(item(selection, 'sample-selection.set-loop')).toMatchObject({ enabled: false, tooltip: 'Select a part first' })
    expect(item(selection, 'sample-selection.add-marker')).toMatchObject({ enabled: true, tooltip: 'Put a marker at the cursor' })
    select({ from: 100, to: 300, channels: 'left' })
    runAction('sample-selection.make-region', selection, fakeContext())
    runAction('sample-selection.set-loop', selection, fakeContext())
    expect(sample().regions).toEqual([expect.objectContaining({ from: 100, to: 300, name: 'Region 1' })])
    expect(sample().loop).toEqual({ from: 100, to: 300 })
  })

  it('refuse at the limit, and are gone with the sample', () => {
    const many = Array.from({ length: SAMPLE_MARK_LIMITS.markers }, (_, i) => ({ id: `m${i}`, frame: i, name: '' }))
    load({ ...PAD, markers: many, regions: many.map(({ id, frame }) => ({ id, from: frame, to: frame + 1, name: '' })) })
    select({ from: 100, to: 300, channels: 'both' })
    expect(item(selection, 'sample-selection.add-marker')).toMatchObject({ enabled: false, tooltip: 'A sample keeps at most 256 markers' })
    expect(item(selection, 'sample-selection.make-region')).toMatchObject({ enabled: false, tooltip: 'A sample keeps at most 256 regions' })
    expect(item(selection, 'sample-selection.set-loop')?.enabled).toBe(true)
    expect(describeActions({ kind: 'sample-selection', sampleId: 'gone', pane: 'main' }, fakeContext())).toEqual([])
  })
})

describe('a drag of a mark', () => {
  it('is one undo step: every move passes the same merge key', () => {
    load({ ...PAD, markers: [{ id: 'm', frame: 100, name: 'Hit' }] })
    const steps = undoSteps()
    const store = useProjectStore.getState()
    for (const frame of [110, 130, 160, 200]) store.editSampleMarks(PAD.id, (info) => moveMarker(info, 'm', frame), `marker:${key}:m`)
    expect(sample().markers![0]!.frame).toBe(200)
    expect(undoSteps()).toBe(steps + 1)
    useProjectStore.getState().undo()
    expect(sample().markers![0]!.frame).toBe(100)
  })
})

describe('the mark subjects', () => {
  const MARKED: SampleInfo = setLoop(
    { ...PAD, markers: [{ id: 'm', frame: 400, name: 'Hit' }], regions: [{ id: 'r', from: 100, to: 300, name: 'Intro' }] },
    { from: 500, to: 700 },
  )
  const marker: Subject = { kind: 'sample-marker', sampleId: PAD.id, pane: 'main', markerId: 'm' }
  const region: Subject = { kind: 'sample-region', sampleId: PAD.id, pane: 'main', regionId: 'r' }
  const loop: Subject = { kind: 'sample-loop', sampleId: PAD.id, pane: 'main' }
  beforeEach(() => load(MARKED))

  it('list their actions in group order, and are named after the mark and its sample', () => {
    expect(listed(marker)).toEqual(['open: Go to', 'edit: Rename', 'delete: Delete'])
    expect(listed(region)).toEqual(['open: Select', 'edit: Rename', 'delete: Delete', 'marks: Set loop from region', 'view: Play', 'view: Zoom to region'])
    expect(listed(loop)).toEqual(['open: Select', 'delete: Clear loop', 'view: Play loop', 'view: Zoom to loop'])
    expect([marker, region, loop].map(subjectName)).toEqual(['Hit in Pad', 'Intro in Pad', 'Loop in Pad'])
  })

  it('go to a marker: the cursor there, no selection, the view asked to show it', () => {
    select({ from: 10, to: 20, channels: 'both' })
    runAction('sample-marker.go-to', marker, fakeContext())
    expect(view()).toMatchObject({ cursor: 400, selection: null, zoomTo: { show: 400 } })
  })

  it('select a region or the loop, zoom to it, and set the loop from a region', () => {
    runAction('sample-region.select', region, fakeContext())
    expect(view()).toMatchObject({ cursor: 100, selection: { from: 100, to: 300, channels: 'both' } })
    runAction('sample-loop.zoom', loop, fakeContext())
    expect(view().zoomTo).toEqual({ from: 500, to: 700 })
    runAction('sample-region.set-loop', region, fakeContext())
    expect(sample().loop).toEqual({ from: 100, to: 300 })
  })

  it("act on the pane they were invoked from, and leave the other pane's view alone", () => {
    const second = `second:${originOf(PAD)}`
    const secondView = () => waveViewOf(useWaveEditorStore.getState().views, second)
    runAction('sample-marker.go-to', { ...marker, pane: 'second' } as Subject, fakeContext())
    runAction('sample-region.select', { ...region, pane: 'second' } as Subject, fakeContext())
    expect(secondView()).toMatchObject({ cursor: 100, selection: { from: 100, to: 300 }, zoomTo: { show: 400 } })
    expect(view()).toMatchObject({ cursor: 0, selection: null })
    runAction('sample-loop.zoom', { ...loop, pane: 'second' } as Subject, fakeContext())
    expect(secondView().zoomTo).toEqual({ from: 500, to: 700 })
    expect(view().zoomTo).toBeUndefined()
  })

  it('play a region with the preview, and the loop looping', () => {
    const context = fakeContext()
    runAction('sample-region.play', region, context)
    runAction('sample-loop.play', loop, context)
    expect(context.calls).toEqual(['samples.preview("pad", {"from":100,"to":300,"loop":false})', 'samples.preview("pad", {"from":500,"to":700,"loop":true})'])
  })

  it('delete and rename through their verbs, one undo step each', () => {
    const context = fakeContext({ origin: 'wave' })
    const steps = undoSteps()
    expect(runVerb('delete', [marker], context)).toBe(true)
    expect(runVerb('delete', [loop], context)).toBe(true)
    expect(sample().markers).toEqual([])
    expect(sample()).not.toHaveProperty('loop')
    expect(undoSteps()).toBe(steps + 2)
    commitRename(region, '  Verse ', context)
    expect(sample().regions![0]!.name).toBe('Verse')
    expect(undoSteps()).toBe(steps + 3)
    commitRename(region, '   ', context)
    expect(undoSteps()).toBe(steps + 3)
    // A deleted mark's subject has nothing left to offer.
    expect(describeActions(marker, context)).toEqual([])
    expect(describeActions(loop, context)).toEqual([])
  })
})
