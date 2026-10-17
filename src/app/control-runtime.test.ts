import { afterEach, describe, expect, it, vi } from 'vitest'
import { Engine, type EngineCommand, type ControlTarget, createDemoProject, createNode, editPatchAt, serializeProject } from '@core'
import type { AudioHost } from '@audio'
import { ProjectStorage } from '@storage'
import { createControlGesture, useControlStore, useProjectStore } from '@state'
import { connectEngine } from './project-sync'
import { startAutosave } from './autosave'
import { createEngineControls } from './engine-controls'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); useControlStore.getState().clear() })
const master: ControlTarget = { kind: 'mixer', owner: { kind: 'master' }, control: 'volume' }
const hostFor = (engine: Engine) => ({ send: (command: EngineCommand) => engine.apply(command), onStatus: () => () => {}, start: async () => {} }) as unknown as AudioHost
const peak = (engine: Engine) => {
  const left = new Float32Array(128), right = new Float32Array(128)
  engine.render(left, right)
  return Math.max(...left.map(Math.abs), ...right.map(Math.abs))
}

describe('runtime control ownership', () => {
  it('changes real engine output and releases to the base without history or autosave writes', () => {
    vi.useFakeTimers()
    vi.stubGlobal('document', new EventTarget())
    vi.stubGlobal('window', new EventTarget())
    const project = createDemoProject()
    useProjectStore.getState().resetProject(project)
    const engine = new Engine(48000)
    const host = hostFor(engine)
    const disconnect = connectEngine(host)
    const writes = vi.fn()
    const storage = new ProjectStorage({ getItem: () => null, setItem: writes, removeItem: () => {} })
    const stopSave = startAutosave(storage, true)
    try {
      const history = useProjectStore.getState().history
      const bytes = serializeProject(project)
      const track = project.tracks.find((track) => track.kind === 'instrument')!
      engine.apply({ type: 'track/audition', trackId: track.id, pitch: 60, velocity: 1 })
      expect(peak(engine)).toBeGreaterThan(0)
      expect(useControlStore.getState().setOverride(master, 0).status).toBe('available')
      expect(peak(engine)).toBe(0)
      useControlStore.getState().release(master)
      expect(peak(engine)).toBeGreaterThan(0)
      expect(useProjectStore.getState().history).toBe(history)
      expect(useProjectStore.getState().project).toBe(project)
      expect(serializeProject(project)).toBe(bytes)
      vi.advanceTimersByTime(2000)
      expect(writes).not.toHaveBeenCalled()
      useControlStore.getState().setOverride(master, 0)
      createEngineControls(host).stop()
      expect(useControlStore.getState().overrides).toEqual([])
      useControlStore.getState().setOverride(master, 0)
      useProjectStore.getState().resetProject(project)
      expect(useControlStore.getState().overrides).toEqual([])
      useControlStore.getState().setOverride(master, 0)
      useProjectStore.getState().replaceProject(createDemoProject())
      expect(useControlStore.getState().overrides).toEqual([])
    } finally { disconnect(); stopSave() }
  })

  it('retains overrides across base edits, restores the latest base and clears removed owners', () => {
    const project = createDemoProject()
    useProjectStore.getState().resetProject(project)
    const sent: EngineCommand[] = []
    const host = { send: (command: EngineCommand) => sent.push(command), onStatus: () => () => {} } as unknown as AudioHost
    const disconnect = connectEngine(host)
    try {
      useControlStore.getState().setOverride(master, 0.2)
      useProjectStore.getState().setMasterVolume(0.7)
      expect(useControlStore.getState().overrides).toHaveLength(1)
      sent.length = 0
      useControlStore.getState().release(master)
      expect(sent).toContainEqual({ type: 'master/setVolume', volume: 0.7 })
      const track = project.tracks[0]!
      useControlStore.getState().setOverride({ kind: 'mixer', owner: { kind: 'track', trackId: track.id }, control: 'volume' }, 0)
      useProjectStore.getState().removeTrack(track.id)
      expect(useControlStore.getState().overrides).toHaveLength(0)
    } finally { disconnect() }
  })

  it('groups a long gesture and separates consecutive gestures, with undo/redo', () => {
    vi.useFakeTimers()
    useProjectStore.getState().resetProject(createDemoProject())
    const gesture = createControlGesture()
    gesture.begin()
    gesture.change([{ target: master, value: 0.5 }])
    vi.advanceTimersByTime(10000)
    gesture.change([{ target: master, value: 0.4 }])
    gesture.end()
    expect(useProjectStore.getState().history.past).toHaveLength(1)
    gesture.begin()
    gesture.change([{ target: master, value: 0.3 }])
    gesture.end()
    expect(useProjectStore.getState().history.past).toHaveLength(2)
    useProjectStore.getState().undo()
    expect(useProjectStore.getState().project.master.volume).toBe(0.4)
    useProjectStore.getState().undo()
    expect(useProjectStore.getState().project.master.volume ?? 1).toBe(1)
    useProjectStore.getState().redo()
    expect(useProjectStore.getState().project.master.volume).toBe(0.4)
  })
})


it('commits both XY axes atomically as one manual transaction', () => {
  const base = createDemoProject()
  const track = base.tracks[0]!
  const node = { ...createNode('xyPad', 0, 0), id: 'pad' }
  const project = editPatchAt(base, { trackId: track.id }, () => ({ nodes: [node], connections: [] }))
  useProjectStore.getState().resetProject(project)
  const gesture = createControlGesture()
  gesture.begin()
  gesture.change(['x', 'y'].map((paramId) => ({ target: { kind: 'graph' as const, owner: { kind: 'track' as const, trackId: track.id }, domain: 'patch' as const, path: [], nodeId: 'pad', nodeType: 'xyPad', paramId }, value: 0.7 })))
  gesture.end()
  expect(useProjectStore.getState().history.past).toHaveLength(1)
  useProjectStore.getState().undo()
  expect(useProjectStore.getState().project).toBe(project)
})

it('routes held-note controls without document/history writes and panics on replacement and disconnect', () => {
  const project = createDemoProject()
  useProjectStore.getState().resetProject(project)
  const engine = new Engine(48000)
  const sent: EngineCommand[] = []
  const host = { send: (command: EngineCommand) => { sent.push(command); engine.apply(command) }, onStatus: () => () => {}, start: async () => {} } as unknown as AudioHost
  const disconnect = connectEngine(host)
  const controls = createEngineControls(host)
  const track = project.tracks.find((track) => track.kind === 'instrument')!
  const note = { sourceId: 'keyboard', channel: 0, noteId: 'press' }
  const history = useProjectStore.getState().history
  const bytes = serializeProject(project)
  try {
    controls.noteOn(track.id, note, 60, 1)
    expect(peak(engine)).toBeGreaterThan(0)
    controls.sustain(note.sourceId, 0, true)
    controls.noteOff(track.id, note)
    controls.releaseSource(note.sourceId, 0)
    controls.panic()
    expect(sent).toEqual(expect.arrayContaining([
      { type: 'track/noteOn', trackId: track.id, note, pitch: 60, velocity: 1 },
      { type: 'track/noteOff', trackId: track.id, note },
      { type: 'notes/sustain', sourceId: note.sourceId, channel: 0, down: true },
      { type: 'notes/releaseSource', sourceId: note.sourceId, channel: 0 },
      { type: 'notes/panic' },
    ]))
    expect(useProjectStore.getState().history).toBe(history)
    expect(serializeProject(useProjectStore.getState().project)).toBe(bytes)
    sent.length = 0
    useProjectStore.getState().resetProject(project) // same IDs and same graphs must still release notes
    expect(sent).toContainEqual({ type: 'notes/panic' })
  } finally { sent.length = 0; disconnect() }
  expect(sent).toContainEqual({ type: 'notes/panic' })
})
