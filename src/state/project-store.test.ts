import { createDemoProject, createEmptyProject, setNodeParam } from '@core'
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
    const track = store().project.tracks[0]!
    const filter = track.patch.nodes.find((node) => node.type === 'filter')!
    const original = filter.params.cutoff

    for (let step = 1; step <= 30; step++) {
      vi.advanceTimersByTime(16)
      store().updatePatch(track.id, (patch) => setNodeParam(patch, filter.id, 'cutoff', 100 + step * 10), `param:${filter.id}:cutoff`)
    }
    store().undo()

    const restored = store().project.tracks[0]!.patch.nodes.find((node) => node.id === filter.id)!
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
})
