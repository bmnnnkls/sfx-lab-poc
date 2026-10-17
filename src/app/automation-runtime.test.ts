import { afterEach, describe, expect, it, vi } from 'vitest'
import { type ControlTarget, Engine, type EngineCommand, type EngineStatus, type InstrumentTrack, createClip, createEmptyProject, createNote, serializeProject } from '@core'
import type { AudioHost } from '@audio'
import { createControlGesture, useControlStore, useProjectStore } from '@state'
import { ProjectStorage } from '@storage'
import { connectEngine } from './project-sync'
import { createMidiControls } from './midi-controls'
import { startAutosave } from './autosave'
const target: ControlTarget = { kind: 'mixer', owner: { kind: 'track', trackId: 'auto' }, control: 'volume' }
const setup = () => {
  const p = createEmptyProject(), t = p.tracks[0] as InstrumentTrack
  const project = { ...p, tracks: [{ ...t, id: 'auto', volume: 0.2, clips: [{ ...createClip('lane', 4, [createNote(60, 0, 4)]), id: 'clip', automation: [{ id: 'lane', enabled: true, target, points: [{ id: 'p', beat: 0, value: 0.6, interpolation: 'hold' as const }] }] }] }], midiMappings: [{ id: 'cc', deviceId: 'keys', deviceName: 'Keys', channel: 0, cc: 21, pickup: true, target }] }
  useProjectStore.getState().resetProject(project)
  useControlStore.setState({ overrides: [], playback: [] })
  const engine = new Engine(8000)
  let listener = (_: EngineStatus) => {}
  const host = { send: (c: EngineCommand) => engine.apply(c), onStatus: (fn: typeof listener) => { listener = fn; return () => {} }, start: async () => {} } as unknown as AudioHost
  const disconnect = connectEngine(host)
  const step = (frames = 128) => { engine.render(new Float32Array(frames), new Float32Array(frames)); listener(engine.status()) }
  engine.apply({ type: 'clip/launch', trackId: 'auto', clipId: 'clip' }); step()
  return { project, engine, disconnect, step }
}
afterEach(() => { useControlStore.setState({ overrides: [], playback: [] }); vi.useRealTimers(); vi.unstubAllGlobals() })
describe('automation runtime ownership', () => {
  it('manual and MIDI edits override Read with no history/autosave writes, then release and quantized relaunch resume it', () => {
    vi.useFakeTimers(); vi.stubGlobal('document', new EventTarget()); vi.stubGlobal('window', new EventTarget())
    const { project, engine, disconnect, step } = setup(), writes = vi.fn()
    const stopSave = startAutosave(new ProjectStorage({ getItem: () => null, setItem: writes, removeItem: () => {} }), true)
    const history = useProjectStore.getState().history, saved = serializeProject(project)
    try {
      expect(useControlStore.getState().playback[0]?.value).toBe(0.6)
      const gesture = createControlGesture(); gesture.begin(); gesture.change([{ target, value: 0.1 }]); gesture.end(); step()
      expect(useControlStore.getState().overrides[0]?.value).toBe(0.1)
      expect(useProjectStore.getState().history).toBe(history)
      useControlStore.getState().release(target); step()
      expect(useControlStore.getState().overrides).toEqual([])
      const midi = createMidiControls()
      midi.receive('keys', 'Keys', { kind: 'cc', channel: 1, cc: 21, value: 0 })
      expect(useControlStore.getState().overrides).toEqual([]) // pickup must cross effective 0.6
      midi.receive('keys', 'Keys', { kind: 'cc', channel: 1, cc: 21, value: 100 }); step()
      expect(useControlStore.getState().overrides[0]?.value).toBeCloseTo(100 / 127)
      engine.apply({ type: 'clip/launch', trackId: 'auto', clipId: 'clip' })
      step(16000) // next bar, engine owns override release at the actual launch boundary
      expect(useControlStore.getState().overrides).toEqual([])
      expect(useControlStore.getState().playback[0]?.value).toBe(0.6)
      vi.advanceTimersByTime(2000)
      expect(useProjectStore.getState().history).toBe(history)
      expect(serializeProject(useProjectStore.getState().project)).toBe(saved)
      expect(writes).not.toHaveBeenCalled()
    } finally { disconnect(); stopSave() }
  })
})
