import { clipAt, createDemoProject, createEmptyProject, createNote, regionClipRef, sessionClipRef, setNodeParam, type InstrumentTrack } from '@core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { selectCanRedo, selectCanUndo, useProjectStore } from './project-store'

const store = () => useProjectStore.getState()

describe('project store undo/redo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    store().resetProject(createDemoProject())
  })
  afterEach(() => vi.useRealTimers())

  it('starts with nothing to undo', () => {
    expect(selectCanUndo(store())).toBe(false)
    expect(selectCanRedo(store())).toBe(false)
  })

  it('undoes and redoes a tempo change', () => {
    const original = store().project.tempo
    store().setTempo(150)
    expect(store().project.tempo).toBe(150)

    store().undo()
    expect(store().project.tempo).toBe(original)
    expect(selectCanRedo(store())).toBe(true)

    store().redo()
    expect(store().project.tempo).toBe(150)
  })

  it('turns a burst of slider changes into one undo step', () => {
    const track = store().project.tracks[0] as InstrumentTrack
    const filter = track.patch.nodes.find((node) => node.type === 'filter')!
    const original = filter.params.cutoff

    for (let step = 1; step <= 30; step++) {
      vi.advanceTimersByTime(16)
      store().updatePatch(track.id, (patch) => setNodeParam(patch, filter.id, 'cutoff', 100 + step * 10), `param:${filter.id}:cutoff`)
    }
    store().undo()

    const restored = (store().project.tracks[0] as InstrumentTrack).patch.nodes.find((node) => node.id === filter.id)!
    expect(restored.params.cutoff).toBe(original)
    expect(selectCanUndo(store())).toBe(false)
  })

  it('treats separate discrete edits as separate steps', () => {
    store().addTrack()
    store().addTrack()
    expect(store().project.tracks).toHaveLength(5)

    store().undo()
    expect(store().project.tracks).toHaveLength(4)
    store().undo()
    expect(store().project.tracks).toHaveLength(3)
  })

  it('makes replacing the project undoable, but not the startup load', () => {
    const original = store().project
    store().replaceProject(createEmptyProject())
    expect(store().project.name).toBe('Untitled')

    store().undo()
    expect(store().project).toBe(original)

    store().resetProject(createEmptyProject())
    expect(selectCanUndo(store())).toBe(false)
  })

  it('drops the redo stack after a new edit', () => {
    store().setTempo(100)
    store().undo()
    store().addTrack()
    expect(selectCanRedo(store())).toBe(false)
  })

  it("edits a region's own copy as one undo step, leaving its session source alone", () => {
    const bass = store().project.tracks[0] as InstrumentTrack
    const source = bass.clips[0]!
    store().addArrangementClip(bass.id, 8, source)
    const region = regionClipRef(store().project.arrangement![0]!.id)
    const before = store().history.past.length
    store().setClipNotes(region, [createNote(48, 0, 1)])
    const edited = clipAt(store().project, region)!
    expect('notes' in edited && edited.notes).toHaveLength(1)
    expect(clipAt(store().project, sessionClipRef(bass.id, source.id))).toBe(source)
    expect(store().history.past.length).toBe(before + 1)
    // The same notes again add no step.
    store().setClipNotes(region, 'notes' in edited ? edited.notes : [])
    expect(store().history.past.length).toBe(before + 1)
    store().undo()
    expect(clipAt(store().project, region)).toBe(source)
  })
})
