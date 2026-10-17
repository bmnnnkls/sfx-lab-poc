import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Engine, type EngineCommand, type MidiMapping, type Patch, createDemoProject, controlFromNormalized, diffProject, resolveControlTarget } from '@core'
import { type EngineControls, editMidiMappings, useControlStore, useMidiStore, useProjectStore, useSelectionStore } from '@state'
import { createMidiInput } from './midi-input'

const port = (id = 'keys') => ({ id, name: id, state: 'connected', onmidimessage: null, close: vi.fn(async () => {}) }) as unknown as MIDIInput
const fakeAccess = (...inputs: MIDIInput[]) => ({ inputs: new Map(inputs.map((p) => [p.id, p])), onstatechange: null }) as unknown as MIDIAccess
const send = (p: MIDIInput, bytes: number[]) => p.onmidimessage?.call(p, { data: new Uint8Array(bytes) } as MIDIMessageEvent)
const controls = (): EngineControls => ({ noteOn: vi.fn(), noteOff: vi.fn(), sustain: vi.fn(), releaseSource: vi.fn(), panic: vi.fn(), play: vi.fn(), stop: vi.fn(), stopTrack: vi.fn(), launchClip: vi.fn(), launchAutomation: vi.fn(), launchScene: vi.fn(), auditionNote: vi.fn() })
const target = { kind: 'mixer' as const, owner: { kind: 'master' as const }, control: 'volume' as const }
const mapping = (extra: Partial<MidiMapping> = {}): MidiMapping => ({ id: 'binding', deviceId: 'keys', deviceName: 'keys', channel: 0, cc: 21, target, pickup: true, ...extra })
const learn = (p: MIDIInput, bytes = [0xb0, 21, 10]) => { useMidiStore.getState().learn(target); send(p, bytes) }

beforeEach(() => {
  useProjectStore.getState().resetProject(createDemoProject())
  useSelectionStore.getState().selectTrack(useProjectStore.getState().project.tracks[0]!.id)
  useControlStore.getState().clear()
  useMidiStore.setState({ status: 'disabled', inputs: [], disabledInputs: [], channel: null, pinnedTrackId: null, learning: undefined, conflict: undefined, feedback: {} })
})

describe('browser MIDI lifecycle with fake ports', () => {
  it('requests only on enable, handles denial/unsupported and stale permission grants', async () => {
    const request = vi.fn(async () => { throw new Error('Permission denied') })
    const adapter = createMidiInput(controls(), request)
    expect(request).not.toHaveBeenCalled()
    await adapter.enable()
    expect(useMidiStore.getState().status).toBe('denied')
    expect(useMidiStore.getState().error).toBe('Permission denied')
    adapter.disable()
    const unsupported = createMidiInput(controls())
    await unsupported.enable()
    expect(useMidiStore.getState().status).toBe('unsupported')
    let resolve!: (a: MIDIAccess) => void
    const pending = createMidiInput(controls(), () => new Promise((r) => { resolve = r }))
    const enabling = pending.enable(); pending.disable(); const p = port(); resolve(fakeAccess(p)); await enabling
    expect(p.onmidimessage).toBeNull()
    expect(useMidiStore.getState().status).toBe('disabled')
  })
  it('pairs repeated pitches per press and converts parser channels exactly once', async () => {
    const p = port(), c = controls(), adapter = createMidiInput(c, async () => fakeAccess(p))
    await adapter.enable()
    send(p, [0x92, 60, 127]); send(p, [0x92, 60, 80]); send(p, [0x82, 60, 0]); send(p, [0x92, 60, 0]); send(p, [0x82, 60, 0])
    const ons = vi.mocked(c.noteOn).mock.calls
    expect(ons).toHaveLength(2)
    expect(ons[0]![1].channel).toBe(2)
    expect(ons[0]![1].noteId).not.toBe(ons[1]![1].noteId)
    expect(vi.mocked(c.noteOff).mock.calls.map((call) => call[1])).toEqual(ons.map((call) => call[1]))
    send(p, [0xb2, 64, 127]); send(p, [0xb2, 123, 0])
    expect(c.sustain).toHaveBeenCalledWith('midi:keys', 2, true)
    expect(c.releaseSource).toHaveBeenCalledWith('midi:keys', 2)
    adapter.disable()
  })
  it('cleans disconnect, input disable, channel, destination, project replacement and panic', async () => {
    const p = port(), c = controls(), a = fakeAccess(p), adapter = createMidiInput(c, async () => a), dispose = adapter.connect()
    await adapter.enable(); send(p, [0x90, 60, 127])
    useMidiStore.setState({ channel: 1 })
    expect(c.releaseSource).toHaveBeenCalledWith('midi:keys', undefined)
    send(p, [0x90, 61, 127]); expect(c.noteOn).toHaveBeenCalledTimes(1)
    useMidiStore.setState({ channel: null, pinnedTrackId: useProjectStore.getState().project.tracks[0]!.id })
    useSelectionStore.getState().selectMaster(); send(p, [0x90, 62, 127]); expect(c.noteOn).toHaveBeenCalledTimes(2)
    useMidiStore.setState({ pinnedTrackId: null }); send(p, [0x90, 63, 127]); expect(c.noteOn).toHaveBeenCalledTimes(2)
    useMidiStore.setState({ disabledInputs: ['keys'] }); expect(p.onmidimessage).toBeNull(); expect(p.close).toHaveBeenCalled()
    useMidiStore.setState({ disabledInputs: [] }); await Promise.resolve(); await Promise.resolve(); expect(p.onmidimessage).not.toBeNull()
    Object.assign(p, { state: 'disconnected' }); a.onstatechange?.call(a, {} as MIDIConnectionEvent)
    expect(p.onmidimessage).toBeNull()
    Object.assign(p, { state: 'connected' }); a.onstatechange?.call(a, {} as MIDIConnectionEvent)
    await Promise.resolve(); await Promise.resolve()
    expect(p.onmidimessage).not.toBeNull()
    useProjectStore.getState().replaceProject(useProjectStore.getState().project)
    expect(c.panic).toHaveBeenCalled()
    adapter.panic(); send(p, [0x80, 60, 0]); expect(c.noteOff).not.toHaveBeenCalled()
    dispose(); expect(a.onstatechange).toBeNull(); expect(p.onmidimessage).toBeNull()
  })
})

describe('CC learn and pickup', () => {
  it('learns without changing sound; reserves sustain/modes, supports cancel, conflicts, reassign and remove', async () => {
    const p = port(), adapter = createMidiInput(controls(), async () => fakeAccess(p)), dispose = adapter.connect()
    await adapter.enable()
    useMidiStore.getState().learn(target)
    send(p, [0xb0, 64, 127]); send(p, [0xb0, 123, 0]); expect(useProjectStore.getState().project.midiMappings).toBeUndefined()
    useMidiStore.getState().cancelLearn(); send(p, [0xb0, 21, 0]); expect(useProjectStore.getState().project.midiMappings).toBeUndefined()
    const before = useProjectStore.getState().project.master.volume
    learn(p); expect(useProjectStore.getState().project.master.volume).toBe(before)
    expect(useProjectStore.getState().project.midiMappings).toHaveLength(1)
    const second = { kind: 'mixer' as const, owner: { kind: 'track' as const, trackId: useProjectStore.getState().project.tracks[0]!.id }, control: 'volume' as const }
    useMidiStore.getState().learn(second); send(p, [0xb0, 21, 0])
    expect(useMidiStore.getState().conflict).toBeDefined()
    expect(useProjectStore.getState().project.midiMappings![0]!.target).toEqual(target)
    useMidiStore.getState().confirmReassign()
    expect(useProjectStore.getState().project.midiMappings).toHaveLength(1)
    expect(useProjectStore.getState().project.midiMappings![0]!.target).toEqual(second)
    editMidiMappings(() => []); expect(useProjectStore.getState().project.midiMappings).toEqual([])
    dispose()
  })
  it('crosses effective value, rearms after manual edits, scales/snaps and groups history by inactivity', async () => {
    vi.useFakeTimers()
    const p = port(), adapter = createMidiInput(controls(), async () => fakeAccess(p)), dispose = adapter.connect()
    await adapter.enable()
    useProjectStore.getState().setMasterVolume(0.5)
    editMidiMappings(() => [mapping()])
    const count = useProjectStore.getState().history.past.length
    send(p, [0xb0, 21, 10]); expect(useMidiStore.getState().feedback.binding?.state).toBe('pickup')
    send(p, [0xb0, 21, 90]); send(p, [0xb0, 21, 100]); expect(useProjectStore.getState().project.master.volume).toBeCloseTo(100 / 127, 2)
    expect(useProjectStore.getState().history.past).toHaveLength(count + 1)
    vi.advanceTimersByTime(801); send(p, [0xb0, 21, 110]); expect(useProjectStore.getState().history.past).toHaveLength(count + 2)
    useProjectStore.getState().setMasterVolume(0.2); send(p, [0xb0, 21, 100]); expect(useProjectStore.getState().project.master.volume).toBe(0.2)
    send(p, [0xb0, 21, 0]); expect(useProjectStore.getState().project.master.volume).toBe(0)
    useControlStore.getState().setOverride(target, 0.8); send(p, [0xb0, 21, 0]); expect(useControlStore.getState().overrides[0]!.value).toBe(0.8)
    send(p, [0xb0, 21, 127]); expect(useControlStore.getState().overrides[0]!.value).toBe(1)
    expect(useProjectStore.getState().project.master.volume).toBe(0)
    dispose(); vi.useRealTimers()
  })
  it('keeps unavailable/wired targets inert and handles rebinding', async () => {
    const p = port(), other = port('other'), adapter = createMidiInput(controls(), async () => fakeAccess(p, other)), dispose = adapter.connect()
    await adapter.enable()
    editMidiMappings(() => [mapping({ deviceId: 'missing', pickup: false })])
    send(p, [0xb0, 21, 0]); expect(useProjectStore.getState().project.master.volume).toBeUndefined()
    editMidiMappings((ms) => ms.map((m) => ({ ...m, deviceId: 'other' })))
    send(other, [0xb0, 21, 0]); expect(useProjectStore.getState().project.master.volume).toBe(0)
    editMidiMappings(() => [mapping({ target: { kind: 'graph', owner: { kind: 'master' }, domain: 'fx', path: [], nodeId: 'missing', nodeType: 'filter', paramId: 'cutoff' } })])
    send(p, [0xb0, 21, 127]); expect(useMidiStore.getState().feedback.binding?.state).toBe('unavailable')
    dispose()
  })
})

it('parsed lifecycle commands release real engine output while stopped and preserve source isolation', async () => {
  const demo = createDemoProject()
  const project = { ...demo, tracks: demo.tracks.map((t) => t.kind !== 'instrument' ? t : { ...t, patch: { nodes: [{ id: 'n', type: 'note', x: 0, y: 0, params: {} }, { id: 'o', type: 'output', x: 0, y: 0, params: {} }], connections: [{ id: 'w', from: { node: 'n', port: 'gate' }, to: { node: 'o', port: 'in' } }] } }) }, engine = new Engine(48000)
  for (const command of diffProject(null, project)) engine.apply(command)
  const apply = (command: EngineCommand) => engine.apply(command)
  const c: EngineControls = { ...controls(), noteOn: (trackId, note, pitch, velocity) => apply({ type: 'track/noteOn', trackId, note, pitch, velocity }), noteOff: (trackId, note) => apply({ type: 'track/noteOff', trackId, note }), sustain: (sourceId, channel, down) => apply({ type: 'notes/sustain', sourceId, channel, down }), releaseSource: (sourceId, channel) => apply({ type: 'notes/releaseSource', sourceId, channel }), panic: () => apply({ type: 'notes/panic' }) }
  useProjectStore.getState().resetProject(project); useSelectionStore.getState().selectTrack(project.tracks[0]!.id)
  const p = port(), q = port('second'), a = fakeAccess(p, q), adapter = createMidiInput(c, async () => a)
  await adapter.enable()
  const render = () => { const l = new Float32Array(48000), r = new Float32Array(48000); engine.render(l, r); return Math.max(...l.map(Math.abs)) }
  send(p, [0x90, 60, 127]); send(q, [0x90, 64, 127]); expect(render()).toBeGreaterThan(0.01)
  Object.assign(p, { state: 'disconnected' }); a.onstatechange?.call(a, {} as MIDIConnectionEvent); expect(render()).toBeGreaterThan(0.01)
  adapter.panic(); render(); expect(render()).toBeLessThan(0.0001)
  adapter.disable()
})

it('uses existing logarithmic conversion and discrete snapping', () => {
  const resolved = resolveControlTarget(useProjectStore.getState().project, target)
  expect(resolved.status).toBe('available')
  expect(controlFromNormalized({ id: 'x', label: 'x', min: 20, max: 20000, default: 200, curve: 'log' }, 0.5)).toBeCloseTo(Math.sqrt(20 * 20000))
})

it('maps independent nested switches/selectors; momentary release and disconnect form one gesture', async () => {
  vi.useFakeTimers()
  const demo = createDemoProject(), trackId = demo.tracks[0]!.id
  const patch: Patch = { nodes: [{ id: 'switch', type: 'switch', x: 0, y: 0, params: { on: 0, mode: 1 } }, { id: 'choice', type: 'selector', x: 0, y: 0, params: { index: 0, count: 3 } }], connections: [] }
  const module = { id: 'controls', name: 'Controls', patch, inputs: [], outputs: [], knobs: [] }
  const project = { ...demo, modules: [module], tracks: demo.tracks.map((t) => t.id === trackId && t.kind === 'instrument' ? { ...t, patch: { nodes: [{ id: 'a', type: 'module', moduleId: 'controls', x: 0, y: 0, params: {} }, { id: 'b', type: 'module', moduleId: 'controls', x: 0, y: 0, params: {} }], connections: [] } } : t) }
  useProjectStore.getState().resetProject(project)
  const switchTarget = { kind: 'graph' as const, owner: { kind: 'track' as const, trackId }, domain: 'patch' as const, path: [{ nodeId: 'a', moduleId: 'controls' }], nodeId: 'switch', nodeType: 'switch', paramId: 'on' }
  const selectorTarget = { ...switchTarget, nodeId: 'choice', nodeType: 'selector', paramId: 'index' }
  const p = port(), access = fakeAccess(p), adapter = createMidiInput(controls(), async () => access), dispose = adapter.connect()
  await adapter.enable()
  editMidiMappings(() => [mapping({ target: switchTarget, pickup: false }), mapping({ id: 'selector', target: selectorTarget, pickup: false, cc: 22 })])
  const count = useProjectStore.getState().history.past.length
  send(p, [0xb0, 21, 63]); send(p, [0xb0, 21, 127]); vi.advanceTimersByTime(2000); send(p, [0xb0, 21, 0])
  expect(useProjectStore.getState().history.past).toHaveLength(count + 1)
  send(p, [0xb0, 22, 70])
  expect(resolveControlTarget(useProjectStore.getState().project, selectorTarget)).toMatchObject({ baseValue: 1 })
  expect(resolveControlTarget(useProjectStore.getState().project, { ...switchTarget, path: [{ nodeId: 'b', moduleId: 'controls' }] })).toMatchObject({ baseValue: 0 })
  send(p, [0xb0, 21, 127]); expect(resolveControlTarget(useProjectStore.getState().project, switchTarget)).toMatchObject({ baseValue: 1 })
  Object.assign(p, { state: 'disconnected' }); access.onstatechange?.call(access, {} as MIDIConnectionEvent)
  expect(resolveControlTarget(useProjectStore.getState().project, switchTarget)).toMatchObject({ baseValue: 0 })
  Object.assign(p, { state: 'connected' }); access.onstatechange?.call(access, {} as MIDIConnectionEvent)
  await Promise.resolve(); await Promise.resolve()
  send(p, [0xb0, 21, 127]); useMidiStore.setState({ disabledInputs: ['keys'] })
  expect(resolveControlTarget(useProjectStore.getState().project, switchTarget)).toMatchObject({ baseValue: 0 })
  useMidiStore.setState({ disabledInputs: [] }); await Promise.resolve(); await Promise.resolve(); send(p, [0xb0, 21, 127])
  editMidiMappings((ms) => ms.filter((m) => m.id !== 'binding'))
  expect(resolveControlTarget(useProjectStore.getState().project, switchTarget)).toMatchObject({ baseValue: 0 })
  dispose(); vi.useRealTimers()
})

it('refuses learn and input on wired parameters with the existing ownership reason', async () => {
  const demo = createDemoProject(), trackId = demo.tracks[0]!.id
  const project = { ...demo, tracks: demo.tracks.map((t) => t.id === trackId && t.kind === 'instrument' ? { ...t, patch: { nodes: [{ id: 'control', type: 'control', x: 0, y: 0, params: { value: 0.2 } }, { id: 'filter', type: 'filter', x: 0, y: 0, params: { cutoff: 1000 } }], connections: [{ id: 'w', from: { node: 'control', port: 'out' }, to: { node: 'filter', port: 'param:cutoff' } }] } } : t) }
  useProjectStore.getState().resetProject(project)
  const target = { kind: 'graph' as const, owner: { kind: 'track' as const, trackId }, domain: 'patch' as const, path: [], nodeId: 'filter', nodeType: 'filter', paramId: 'cutoff' }
  useMidiStore.getState().learn(target); expect(useMidiStore.getState().learning).toBeUndefined()
  editMidiMappings(() => [mapping({ target, pickup: false })])
  const p = port(), adapter = createMidiInput(controls(), async () => fakeAccess(p)); await adapter.enable(); send(p, [0xb0, 21, 127])
  expect(resolveControlTarget(useProjectStore.getState().project, target)).toMatchObject({ baseValue: 1000, automatable: false, reason: 'Driven by a wire; target the upstream control' })
  expect(useMidiStore.getState().feedback.binding?.state).toBe('unavailable')
  adapter.disable()
})

it('defaults stepped continuous knobs to pickup, converts a log scale and rearms on reconnect', async () => {
  const demo = createDemoProject(), trackId = demo.tracks[0]!.id
  useProjectStore.getState().resetProject({ ...demo, tracks: demo.tracks.map((t) => t.id === trackId && t.kind === 'instrument' ? { ...t, patch: { nodes: [{ id: 'knob', type: 'control', x: 0, y: 0, params: { value: 1000, min: 20, max: 20000, step: 1, curve: 1 } }], connections: [] } } : t) })
  const target = { kind: 'graph' as const, owner: { kind: 'track' as const, trackId }, domain: 'patch' as const, path: [], nodeId: 'knob', nodeType: 'control', paramId: 'value' }
  const p = port(), access = fakeAccess(p), adapter = createMidiInput(controls(), async () => access), dispose = adapter.connect()
  await adapter.enable()
  useMidiStore.getState().learn(target); send(p, [0xb0, 21, 0])
  expect(useProjectStore.getState().project.midiMappings![0]!.pickup).toBe(true)
  send(p, [0xb0, 21, 0]); expect(resolveControlTarget(useProjectStore.getState().project, target)).toMatchObject({ baseValue: 1000 })
  send(p, [0xb0, 21, 127]); send(p, [0xb0, 21, 64])
  const resolved = resolveControlTarget(useProjectStore.getState().project, target)
  if (resolved.status !== 'available') throw new Error('missing knob')
  expect(resolved.baseValue).toBe(controlFromNormalized(resolved.spec, 64 / 127))
  Object.assign(p, { state: 'disconnected' }); access.onstatechange?.call(access, {} as MIDIConnectionEvent)
  Object.assign(p, { state: 'connected' }); access.onstatechange?.call(access, {} as MIDIConnectionEvent)
  await Promise.resolve(); await Promise.resolve()
  send(p, [0xb0, 21, 0]); expect(resolveControlTarget(useProjectStore.getState().project, target)).toMatchObject({ baseValue: resolved.baseValue })
  dispose()
})


it('waits for an outstanding port close before reattaching after a rapid input toggle', async () => {
  const p = port(), c = controls(), a = fakeAccess(p)
  let finishClose!: () => void
  Object.assign(p, { close: vi.fn(() => new Promise<void>((resolve) => { finishClose = resolve })) })
  const adapter = createMidiInput(c, async () => a), dispose = adapter.connect()
  await adapter.enable()
  useMidiStore.setState({ disabledInputs: ['keys'] })
  useMidiStore.setState({ disabledInputs: [] })
  expect(p.onmidimessage).toBeNull()
  finishClose(); await Promise.resolve(); await Promise.resolve()
  expect(p.onmidimessage).not.toBeNull()
  send(p, [0x90, 60, 127]); expect(c.noteOn).toHaveBeenCalledTimes(1)
  dispose(); finishClose()
})
