import { afterEach, describe, expect, it, vi } from 'vitest'
import { type Project, type InstrumentTrack, type EngineStatus, type ControlTarget, Engine, type EngineCommand, createEmptyProject, createClip, createAudioTrack, createAudioClip, createReturnTrack, setAutomationSlot, serializeProject, parseProject, automationPosition } from '@core'
import { type AudioHost } from '@audio'
import { cancelTouches, createControlGesture, setTouchClock, useControlStore, useProjectStore, useStatusStore, useTouchStore } from '@state'
import { ProjectStorage } from '@storage'
import { startAutosave } from './autosave'
import { connectEngine } from './project-sync'
import { createMidiControls } from './midi-controls'
const target: ControlTarget = { kind: 'mixer', owner: { kind: 'track', trackId: 't' }, control: 'volume' }
const master: ControlTarget = { ...target, owner: { kind: 'master' } }
const ret: ControlTarget = { ...target, owner: { kind: 'track', trackId: 'r' } }
const setup = (control = target, audio = false) => {
  const p = createEmptyProject(), t = p.tracks[0] as InstrumentTrack
  let project: Project = { ...p, tracks: [{ ...t, id: 't', volume: 0.4, clips: [{ ...createClip('clip', 4), id: 'clip', automation: [{ id: 'lane', enabled: true, target, points: [{ id: 'a', beat: 0, value: 0.4, interpolation: 'hold' }] }] }] }, { ...createReturnTrack('R'), id: 'r' }], midiMappings: [{ id: 'cc', target: control, cc: 21, channel: 0, deviceId: 'keys', deviceName: 'Keys', pickup: true }] }
  if (control !== target) project = setAutomationSlot(project, control.owner, 0, { id: 'slot', name: 'Slot', lengthBeats: 3, automation: [{ id: 'lane', target: control, enabled: true, points: [{ id: 'a', beat: 0, value: 0.4, interpolation: 'hold' }] }] })
  const sample = { id: 'a'.repeat(64), name: 'Sample', extension: 'wav', durationSeconds: 2, sampleRate: 8000, channels: 1, bytes: 64000 }
  if (audio) project = { ...project, samples: [sample], tracks: project.tracks.map((t) => t.id === 't' ? { ...createAudioTrack('Audio', 4), id: 't', volume: 0.4, clips: [{ ...createAudioClip(sample, 120), id: 'clip', lengthBeats: 4, loop: false, automation: (t as InstrumentTrack).clips[0]!.automation }] } : t) }
  useProjectStore.getState().resetProject(project); useControlStore.getState().clear()
  const engine = new Engine(8000)
  let listener = (_: EngineStatus) => {}, beat = 0
  const host = { recordingBeat: () => beat, send: (c: EngineCommand) => engine.apply(c), onStatus: (fn: typeof listener) => { listener = fn; return () => {} } } as unknown as AudioHost
  const disconnect = connectEngine(host)
  if (audio) engine.apply({ type: 'sample/add', sample: { id: sample.id, sampleRate: 8000, data: new Float32Array(16000).fill(0.2) } })
  const step = (frames = 128) => { engine.render(new Float32Array(frames), new Float32Array(frames)); const status = engine.status(); beat = status.beat; listener(status) }
  engine.apply({ type: 'scene/launch', scene: 0 }); step()
  useTouchStore.getState().arm(true)
  const lanes = () => {
    const p = useProjectStore.getState().project
    return (control.owner.kind === 'master' ? p.master.automationSlots?.[0] : control === ret ? p.tracks.find((t) => t.kind === 'return')?.automationSlots?.[0] : (p.tracks[0] as InstrumentTrack).clips[0])?.automation ?? []
  }
  return { engine, project, step, disconnect, lanes, at: (n: number) => { beat = n } }
}
const cleanup: (() => void)[] = []
afterEach(() => { for (const stop of cleanup.splice(0)) stop(); cancelTouches(); setTouchClock(); useControlStore.getState().clear(); useStatusStore.setState({ status: null }); vi.useRealTimers(); vi.unstubAllGlobals() })
describe('Touch takes through common gestures', () => {
  it.each([target, master, ret])('records one transaction into the playing owner and returns to Read (%j)', (control) => {
    const s = setup(control); cleanup.push(s.disconnect)
    const initial = useProjectStore.getState().history, base = serializeProject(s.project)
    const g = createControlGesture(); g.begin(); s.at(1); g.change([{ target: control, value: 0.9 }]); s.at(1.5); g.change([{ target: control, value: 0.2 }])
    expect(useProjectStore.getState().history).toBe(initial)
    expect(serializeProject(useProjectStore.getState().project)).toBe(base)
    expect(useTouchStore.getState().recording).toHaveLength(1)
    s.at(2); g.end()
    expect(useProjectStore.getState().history.past).toHaveLength(initial.past.length + 1)
    expect(useControlStore.getState().overrides).toEqual([])
    expect(automationPosition(s.lanes()[0]!, 1.5)).toBe(0.2)
    expect(automationPosition(s.lanes()[0]!, 2.2)).toBe(0.4)
    const saved = serializeProject(useProjectStore.getState().project)
    const loaded = parseProject(saved)
    expect(loaded.ok).toBe(true)
    useProjectStore.getState().undo(); expect(serializeProject(useProjectStore.getState().project)).toBe(base)
    useProjectStore.getState().redo(); expect(serializeProject(useProjectStore.getState().project)).toBe(saved)
  })
  it('keeps untouched material through two loop passes and a long hold during a UI stall', () => {
    const s = setup(); cleanup.push(s.disconnect)
    const g = createControlGesture(); g.begin(); s.at(3); g.change([{ target, value: 0.8 }]); s.at(4.5); g.end()
    expect(automationPosition(s.lanes()[0]!, 0.2)).toBe(0.8)
    expect(automationPosition(s.lanes()[0]!, 2)).toBe(0.4)
    const h = createControlGesture(); h.begin(); s.at(4.1); h.change([{ target, value: 0.1 }]); s.at(4.3); h.end()
    expect(automationPosition(s.lanes()[0]!, 0.2)).toBe(0.1)
    expect(automationPosition(s.lanes()[0]!, 0.4)).toBe(0.8)
    expect(automationPosition(s.lanes()[0]!, 3.5)).toBe(0.8)
  })
  it('records only after MIDI pickup, releases on inactivity and finishes disconnect without per-CC history', () => {
    vi.useFakeTimers(); const s = setup(); cleanup.push(s.disconnect)
    const midi = createMidiControls(), history = useProjectStore.getState().history
    s.at(1); midi.receive('keys', 'Keys', { kind: 'cc', channel: 1, cc: 21, value: 0 })
    expect(useTouchStore.getState().recording).toEqual([])
    midi.receive('keys', 'Keys', { kind: 'cc', channel: 1, cc: 21, value: 100 })
    expect(useProjectStore.getState().history).toBe(history)
    s.at(2); vi.advanceTimersByTime(800)
    expect(useTouchStore.getState().recording).toEqual([])
    expect(useControlStore.getState().overrides).toEqual([])
    expect(useProjectStore.getState().history.past).toHaveLength(history.past.length + 1)
    s.at(3); midi.receive('keys', 'Keys', { kind: 'cc', channel: 1, cc: 21, value: 0 }); midi.receive('keys', 'Keys', { kind: 'cc', channel: 1, cc: 21, value: 100 })
    s.at(3.5); midi.release('keys')
    expect(useTouchStore.getState().recording).toEqual([])
    expect(automationPosition(s.lanes()[0]!, 3.25)).toBeCloseTo(100 / 127)
  })
  it('cancels a replaced project, and closes takes at actual stop/retrigger boundaries', () => {
    const s = setup(); cleanup.push(s.disconnect)
    const g = createControlGesture(); g.begin(); s.at(1); g.change([{ target, value: 0.8 }])
    s.engine.apply({ type: 'scene/launch', scene: 0 }); s.step(16000)
    expect(useTouchStore.getState().recording).toEqual([])
    expect(automationPosition(s.lanes()[0]!, 3)).toBe(0.8)
    s.at(4.2); g.change([{ target, value: 0.1 }]); expect(useTouchStore.getState().recording).toHaveLength(1)
    useProjectStore.getState().resetProject(s.project)
    g.end(); expect(useProjectStore.getState().project).toBe(s.project)
    expect(useTouchStore.getState().armed).toBe(false)
  })
  it('shows an unavailable reason without creating any destination when stopped', () => {
    const s = setup(); cleanup.push(s.disconnect)
    s.engine.apply({ type: 'transport/stop' }); s.step()
    const g = createControlGesture(); g.begin(); g.change([{ target, value: 0.7 }]); g.end()
    expect(useTouchStore.getState().recording).toEqual([])
    expect(useTouchStore.getState().feedback).toContain('unavailable')
    expect(s.lanes()[0]!.points).toHaveLength(1)
  })
})

it('uses event times after delayed callbacks, rather than callback/frame arrival time', () => {
  const s = setup(); cleanup.push(s.disconnect)
  setTouchClock((ago = 0) => 3 - ago / 1000 * 2)
  const g = createControlGesture(); g.begin(); g.stamp(performance.now() - 500); g.change([{ target, value: 0.9 }]); g.end()
  expect(automationPosition(s.lanes()[0]!, 1.5)).toBe(0.4)
  expect(automationPosition(s.lanes()[0]!, 2.25)).toBe(0.9)
  expect(automationPosition(s.lanes()[0]!, 3.5)).toBe(0.4)
})
it('commits multiple controls atomically and isolates independent pointer/MIDI sources', () => {
  const s = setup(); cleanup.push(s.disconnect)
  const pan: ControlTarget = { ...target, control: 'pan' }, history = useProjectStore.getState().history
  const g = createControlGesture(); g.begin(); s.at(1); g.change([{ target, value: 0.9 }, { target: pan, value: -0.5 }])
  const competitor = createControlGesture(); competitor.begin(); competitor.change([{ target, value: 0.1 }]); competitor.end()
  expect(useControlStore.getState().overrides.find((v) => v.target.kind === 'mixer' && v.target.control === 'volume')?.value).toBe(0.9)
  s.at(2); g.end()
  expect(useProjectStore.getState().history.past).toHaveLength(history.past.length + 1)
  expect(s.lanes()).toHaveLength(2)
  const a = createControlGesture(), b = createControlGesture()
  a.begin(); b.begin(); s.at(2.5); a.change([{ target, value: 0.2 }]); b.change([{ target: pan, value: 0.2 }])
  s.at(3); a.end(); expect(useTouchStore.getState().recording).toHaveLength(1)
  b.end(); expect(useTouchStore.getState().recording).toEqual([])
  expect(useProjectStore.getState().history.past).toHaveLength(history.past.length + 3)
})
it('ends a held take at a quantized stop even if no queued status was delivered', () => {
  const s = setup(); cleanup.push(s.disconnect)
  const g = createControlGesture(); g.begin(); s.at(3); g.change([{ target, value: 0.9 }])
  s.engine.apply({ type: 'track/stop', trackId: 't' }); s.step(16000)
  expect(useTouchStore.getState().recording).toEqual([])
  expect(automationPosition(s.lanes()[0]!, 3.9)).toBe(0.9)
  expect(automationPosition(s.lanes()[0]!, 0.01)).toBe(0.4)
})
it('finishes bounded long holds at 256 beats and discards takes whose destination was deleted', () => {
  const s = setup(); cleanup.push(s.disconnect)
  const g = createControlGesture(); g.begin(); s.at(1); g.change([{ target, value: 0.8 }]); s.at(300); g.change([{ target, value: 0.2 }])
  expect(useTouchStore.getState().recording).toEqual([])
  expect(useTouchStore.getState().feedback).toContain('limit')
  s.at(301); g.change([{ target, value: 0.9 }])
  useProjectStore.getState().deleteClip('t', 0)
  g.end()
  expect(useTouchStore.getState().feedback).toContain('discarded')
  expect((useProjectStore.getState().project.tracks[0] as InstrumentTrack).clips[0]).toBeNull()
})

it('records an audio clip and closes at its exact one-shot boundary', () => {
  const s = setup(target, true); cleanup.push(s.disconnect)
  const g = createControlGesture(); g.begin(); s.at(1); g.change([{ target, value: 0.8 }])
  s.step(20000)
  expect(s.engine.status().tracks.t?.stopBeat).toBeCloseTo(4)
  expect(useTouchStore.getState().recording).toEqual([])
  expect(automationPosition(s.lanes()[0]!, 3.9)).toBe(0.8)
  expect(automationPosition(s.lanes()[0]!, 0.5)).toBe(0.4)
})
it('does not autosave an in-progress take, then schedules one save at commit', () => {
  vi.useFakeTimers(); vi.stubGlobal('document', new EventTarget()); vi.stubGlobal('window', new EventTarget())
  const s = setup(); cleanup.push(s.disconnect)
  const writes = vi.fn()
  cleanup.push(startAutosave(new ProjectStorage({ getItem: () => null, setItem: writes, removeItem: () => {} }), true))
  const g = createControlGesture(); g.begin()
  for (let i = 0; i < 100; i++) { s.at(1 + i / 100); g.change([{ target, value: i / 100 }]) }
  vi.advanceTimersByTime(2000)
  expect(writes).not.toHaveBeenCalled()
  s.at(2); g.end(); vi.advanceTimersByTime(600)
  expect(writes).toHaveBeenCalledTimes(1)
})
it('refuses delayed events that predate a newly launched destination', () => {
  const s = setup(); cleanup.push(s.disconnect)
  s.engine.apply({ type: 'scene/launch', scene: 0 }); s.step(16000)
  const history = useProjectStore.getState().history
  setTouchClock(() => 3)
  const g = createControlGesture(); g.begin(); g.change([{ target, value: 0.9 }]); g.end()
  expect(useTouchStore.getState().feedback).toContain('predates')
  expect(useProjectStore.getState().history).toBe(history)
  expect(useControlStore.getState().overrides).toEqual([])
})
