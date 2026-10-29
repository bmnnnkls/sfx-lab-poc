import { afterEach, expect, it, vi } from 'vitest'
import type { WorkletMessage, HostMessage } from '../protocol'
import { RecordingClock } from '../recording-clock'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetModules(); vi.doUnmock('./prepare-engine') })
it('anchors tempo/transport changes at quantum start and periodic beat status at quantum end', async () => {
  const messages: WorkletMessage[] = []
  class Shell {
    port = { onmessage: (_event: { data: HostMessage }) => {}, postMessage: (message: WorkletMessage) => messages.push(message) }
  }
  let Processor: new () => Shell & { engine: import('@core').Engine; process(input: Float32Array[][], output: Float32Array[][]): boolean } = undefined!
  vi.stubGlobal('sampleRate', 8000); vi.stubGlobal('currentTime', 10)
  vi.stubGlobal('AudioWorkletProcessor', Shell)
  vi.stubGlobal('registerProcessor', (_name: string, factory: typeof Processor) => { Processor = factory })
  await import('./engine-processor')
  const processor = new Processor(), output = [[new Float32Array(128), new Float32Array(128)]]
  processor.port.onmessage({ data: { kind: 'command', command: { type: 'transport/play' } } })
  processor.port.onmessage({ data: { kind: 'prepare' } })
  messages.length = 0
  const fullStatus = vi.spyOn(processor.engine, 'status')
  const clockSnapshot = vi.spyOn(processor.engine, 'clock')
  processor.process([], output)
  expect(clockSnapshot).toHaveBeenCalledTimes(1)
  expect(fullStatus).toHaveBeenCalledTimes(1)
  expect(messages[0]).toMatchObject({ kind: 'clock', audioTime: 10, clock: { beat: 0, tempo: 120, playing: true } })
  expect(messages[1]).toMatchObject({ audioTime: 10.016, status: { beat: 0.032, tempo: 120 } })
  vi.stubGlobal('currentTime', 10.016)
  processor.port.onmessage({ data: { kind: 'command', command: { type: 'transport/setTempo', bpm: 60 } } })
  processor.process([], output)
  expect(fullStatus).toHaveBeenCalledTimes(2)
  expect(messages[2]).toMatchObject({ kind: 'clock', audioTime: 10.016, clock: { beat: 0.032, tempo: 60 } })
  const clock = new RecordingClock()
  for (const message of messages) {
    if (message.kind === 'clock') clock.update(message.clock, message.audioTime)
    else if (message.kind === 'status') clock.update(message.status, message.audioTime!)
  }
  expect(clock.beat(10.012)).toBeCloseTo(0.024)
  expect(clock.beat(10.024)).toBeCloseTo(0.04)
})

for (const rate of [8000, 44100, 48000, 96000]) it(`prepares only a throwaway engine; retains first live note, helper clock and assets at ${rate} Hz`, async () => {
  const { Engine, createEmptyProject, noteGraphFrom, diffProject } = await import('@core')
  const messages: WorkletMessage[] = []
  class Shell {
    port = { onmessage: (_event: { data: HostMessage }) => {}, postMessage: (message: WorkletMessage) => messages.push(message) }
  }
  let Processor: new () => Shell & { engine: InstanceType<typeof Engine>; process(input: Float32Array[][], output: Float32Array[][]): boolean } = undefined!
  vi.stubGlobal('sampleRate', rate); vi.stubGlobal('currentTime', 10)
  vi.stubGlobal('AudioWorkletProcessor', Shell)
  vi.stubGlobal('registerProcessor', (_name: string, factory: typeof Processor) => { Processor = factory })
  await import('./engine-processor')
  const p = createEmptyProject(), t = p.tracks[0]!
  if (t.kind !== 'instrument') throw Error('instrument fixture')
  const noteGraph = noteGraphFrom([{ id: 'live', type: 'clipNotes' }, { id: 'v', type: 'control', params: { value: 0 } }, { id: 's', type: 'smooth', params: { time: .01 } }, { id: 'tr', type: 'transpose' }, { id: 'out', type: 'noteOut' }], ['v.out>s.in','s.out>tr.param:semitones','live.out>tr.in','tr.out>out.in'])
  const target = { kind: 'graph' as const, owner: { kind: 'track' as const, trackId: t.id }, domain: 'notes' as const, path: [], nodeId: 'v', nodeType: 'control', paramId: 'value' }
  const project = { ...p, tracks: [{ ...t, noteGraph, clips: [{ id: 'c', name: 'install', lengthBeats: 4, notes: [], automation: [{ id: 'l', enabled: false, target, points: [] }] }] }] }
  const commands = diffProject(null, project), address = { sourceId: 'keyboard', channel: 2, noteId: 'held' }
  const asset = new Float32Array([.1,.2,.3,.4]), savedAsset = asset.slice()
  commands.push({ type: 'sample/add', sample: { id: 'asset', sampleRate: rate, channels: [asset] } }, { type: 'track/noteOn', trackId: t.id, note: address, pitch: 60, velocity: .5 })
  const processor = new Processor(), reference = new Engine(rate)
  for (const command of commands) { processor.port.onmessage({ data: { kind: 'command', command } }); reference.apply(command) }
  const allRenders = vi.spyOn(Engine.prototype, 'render')
  const before = processor.engine.status(), realRenders = () => allRenders.mock.contexts.filter(context=>context === processor.engine).length
  const output = [[new Float32Array(128).fill(3), new Float32Array(128).fill(3)]]
  processor.process([], output)
  expect(realRenders()).toBe(0); expect(output[0]![0]!.every(v=>v === 0)).toBe(true)
  processor.port.onmessage({ data: { kind: 'prepare' } })
  const primingCalls = allRenders.mock.calls.length
  expect(primingCalls).toBeGreaterThan(0)
  processor.port.onmessage({ data: { kind: 'prepare' } }) // readiness is idempotent; never renders the real engine
  expect(realRenders()).toBe(0)
  expect(allRenders).toHaveBeenCalledTimes(primingCalls)
  expect(processor.engine.status()).toEqual(before)
  expect(asset).toEqual(savedAsset)
  expect(messages.filter(m=>m.kind === 'ready')).toHaveLength(2)
  const change = { type: 'track/setParam' as const, trackId: t.id, graph: 'notes' as const, nodeId: 'v', paramId: 'value', value: 1 }
  processor.port.onmessage({ data: { kind: 'command', command: change } }); reference.apply(change)
  const tracks = (processor.engine as unknown as { tracks: Map<string, { apply(event: import('../../core/session').NoteEvent): void }> }).tracks
  const notes = vi.spyOn(tracks.get(t.id)!, 'apply')
  for (const n of [1,97,128,173]) {
    const l = new Float32Array(n), r = new Float32Array(n), a = new Float32Array(n), b = new Float32Array(n)
    processor.process([], [[l,r]]); reference.render(a,b)
    expect(l).toEqual(a); expect(r).toEqual(b)
  }
  const on = notes.mock.calls.map(([e])=>e).find(e=>e.kind === 'noteOn')
  expect(on).toMatchObject({ kind: 'noteOn', pitch: 61, identity: { source: JSON.stringify(['live','keyboard']), channel: 2, id: 'held' } })
  const off = { type: 'track/noteOff' as const, trackId: t.id, note: address }
  processor.port.onmessage({ data: { kind: 'command', command: off } }); reference.apply(off)
  const l = new Float32Array(173), r = new Float32Array(173), a = new Float32Array(173), b = new Float32Array(173)
  processor.process([], [[l,r]]); reference.render(a,b)
  expect(l).toEqual(a); expect(r).toEqual(b)
  const released = notes.mock.calls.map(([e])=>e).find(e=>e.kind === 'noteOff')
  expect(released?.identity).toEqual(on?.identity)
  expect(released).toMatchObject({ kind: 'noteOff', pitch: 61 })
})

it('keeps the real engine silent and unadvanced after preparation fails, including duplicate requests', async () => {
  const { Engine } = await import('@core')
  const prime = vi.fn(() => { throw Error('prime failed') })
  vi.doMock('./prepare-engine', () => ({ prepareEngine: prime }))
  const messages: WorkletMessage[] = []
  class Shell { port = { onmessage: (_event: { data: HostMessage }) => {}, postMessage: (message: WorkletMessage) => messages.push(message) } }
  let Processor: new () => Shell & { engine: InstanceType<typeof Engine>; process(input: Float32Array[][], output: Float32Array[][]): boolean } = undefined!
  vi.stubGlobal('sampleRate', 8000); vi.stubGlobal('currentTime', 0); vi.stubGlobal('AudioWorkletProcessor', Shell)
  vi.stubGlobal('registerProcessor', (_name: string, factory: typeof Processor) => { Processor = factory })
  await import('./engine-processor')
  const processor = new Processor(), render = vi.spyOn(processor.engine, 'render')
  processor.port.onmessage({ data: { kind: 'prepare' } }); processor.port.onmessage({ data: { kind: 'prepare' } })
  const l = new Float32Array(128).fill(3), r = l.slice()
  processor.process([], [[l,r]])
  expect(prime).toHaveBeenCalledTimes(1)
  expect(render).not.toHaveBeenCalled()
  expect(l.every(v=>v === 0) && r.every(v=>v === 0)).toBe(true)
  expect(messages).toEqual([{ kind: 'preparation-error', message: 'prime failed' }, { kind: 'preparation-error', message: 'prime failed' }])
})
