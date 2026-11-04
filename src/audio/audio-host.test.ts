import { afterEach, expect, it, vi } from 'vitest'
import type { HostMessage, WorkletMessage } from './protocol'
import { AudioHost } from './audio-host'

afterEach(() => vi.unstubAllGlobals())
const fixture = ({ failResume = false }: { failResume?: boolean } = {}) => {
  const order: string[] = []
  const sent: HostMessage[] = []
  let contexts = 0
  class Context {
    constructor() { contexts++ }
    state = 'running'
    currentTime = 0
    destination = {}
    audioWorklet = { addModule: async () => { order.push('module') } }
    async suspend() { order.push('suspend'); this.state = 'suspended' }
    async resume() { order.push('resume'); if (failResume) throw new Error('resume failed'); this.state = 'running' }
    async close() { order.push('close'); this.state = 'closed' }
  }
  let node!: Node
  class Node {
    onprocessorerror?: (event: Event) => void
    port = {
      onmessage: (_event: { data: WorkletMessage }) => {},
      postMessage: (message: HostMessage, transfer: Transferable[] = []) => {
        order.push(message.kind === 'prepare' ? 'prepare' : message.command.type)
        sent.push(structuredClone(message, { transfer: transfer as ArrayBuffer[] }))
      },
    }
    constructor() { node = this }
    connect() { order.push('connect') }
  }
  vi.stubGlobal('AudioContext', Context); vi.stubGlobal('AudioWorkletNode', Node)
  return { order, sent, get contexts() { return contexts }, get node() { return node } }
}

it('keeps the context suspended and later commands queued until ready; transfers initial samples once', async () => {
  const f = fixture(), host = new AudioHost(), bytes = new Float32Array([.1,.2,.3])
  host.send({ type: 'sample/add', sample: { id: 'asset', sampleRate: 48000, channels: [bytes] } }, [bytes.buffer])
  const starting = host.start()
  await vi.waitFor(() => expect(f.order).toContain('prepare'))
  expect(bytes.byteLength).toBe(0)
  expect(f.sent[0]).toMatchObject({ kind: 'command', command: { type: 'sample/add', sample: { channels: [new Float32Array([.1,.2,.3])] } } })
  expect(f.order).toEqual(['suspend','module','sample/add','prepare'])
  expect(host.isRunning).toBe(false)
  expect(host.recordingBeat()).toBeUndefined()
  host.send({ type: 'transport/play' })
  expect(f.sent).toHaveLength(2)
  f.node.port.onmessage({ data: { kind: 'ready' } })
  await starting
  expect(f.order).toEqual(['suspend','module','sample/add','prepare','transport/play','connect','resume'])
  expect(host.isRunning).toBe(true)
  expect(f.sent.filter(m=>m.kind === 'command' && m.command.type === 'sample/add')).toHaveLength(1)
})

it('makes preparation failure terminal after sample transfer and safely ignores later actions', async () => {
  const f = fixture(), host = new AudioHost(), failure = vi.fn(), bytes = new Float32Array([.25, .5])
  host.send({ type: 'sample/add', sample: { id: 'asset', sampleRate: 48000, channels: [bytes] } }, [bytes.buffer])
  host.onFailure(failure)
  const starting = host.start()
  await vi.waitFor(() => expect(f.order).toContain('prepare'))
  expect(bytes.byteLength).toBe(0)
  f.node.port.onmessage({ data: { kind: 'preparation-error', message: 'fixture failed' } })
  await starting
  expect(f.order).toEqual(['suspend','module','sample/add','prepare','close'])
  expect(host.isRunning).toBe(false)
  expect(failure).toHaveBeenCalledExactlyOnceWith(new Error('fixture failed'))

  host.send({ type: 'transport/play' })
  await host.start()
  expect(f.contexts).toBe(1)
  expect(f.sent.filter((message) => message.kind === 'command')).toHaveLength(1)
  expect(f.sent.filter((message) => message.kind === 'command').map((message) => message.kind === 'command' ? message.command.type : '')).toEqual(['sample/add'])
  expect(f.order).toEqual(['suspend','module','sample/add','prepare','close'])
  expect(failure).toHaveBeenCalledTimes(1)
})

it('handles a rejected context resume as a terminal failure without rejecting start', async () => {
  const f = fixture({ failResume: true }), host = new AudioHost(), failure = vi.fn()
  host.onFailure(failure)
  const starting = host.start()
  await vi.waitFor(() => expect(f.order).toContain('prepare'))
  f.node.port.onmessage({ data: { kind: 'ready' } })
  await expect(starting).resolves.toBeUndefined()
  expect(f.order).toEqual(['suspend','module','prepare','connect','resume','close'])
  expect(host.isRunning).toBe(false)
  expect(failure).toHaveBeenCalledExactlyOnceWith(new Error('resume failed'))
  host.send({ type: 'transport/play' })
  await host.start()
  expect(f.contexts).toBe(1)
  expect(failure).toHaveBeenCalledTimes(1)
})

it('surfaces a processor error that arrives after the host became ready', async () => {
  const f = fixture(), host = new AudioHost(), failure = vi.fn()
  host.onFailure(failure)
  const starting = host.start()
  await vi.waitFor(() => expect(f.order).toContain('prepare'))
  f.node.port.onmessage({ data: { kind: 'ready' } })
  await starting
  f.node.onprocessorerror?.(new Event('processorerror'))
  await vi.waitFor(() => expect(f.order).toContain('close'))
  expect(host.isRunning).toBe(false)
  expect(failure).toHaveBeenCalledExactlyOnceWith(new Error('Audio engine stopped unexpectedly'))
  host.send({ type: 'transport/play' })
  expect(f.sent.filter((message) => message.kind === 'command')).toHaveLength(0)
})

it('ignores measurement/extension packets without publishing an undefined engine status', async () => {
  const f = fixture(), host = new AudioHost(), status = vi.fn()
  host.onStatus(status)
  const starting = host.start()
  await vi.waitFor(() => expect(f.order).toContain('prepare'))
  f.node.port.onmessage({ data: { kind: 'capacity-probe' } as unknown as WorkletMessage })
  expect(status).not.toHaveBeenCalled()
  f.node.port.onmessage({ data: { kind: 'ready' } }); await starting
  f.node.port.onmessage({ data: { kind: 'capacity-report' } as unknown as WorkletMessage })
  expect(status).not.toHaveBeenCalled()
})

it('uses compact clock anchors for recording before publishing the end-of-quantum readouts', async () => {
  const f = fixture(), host = new AudioHost(), listener = vi.fn()
  host.onStatus(listener)
  const starting = host.start()
  await vi.waitFor(() => expect(f.order).toContain('prepare'))
  f.node.port.onmessage({ data: { kind: 'ready' } }); await starting
  f.node.port.onmessage({ data: { kind: 'clock', clock: { beat: 4, tempo: 240, playing: true }, audioTime: 0 } })
  expect(host.recordingBeat()).toBe(4)
  expect(listener).not.toHaveBeenCalled()
  const status = { beat: 4 + 128 / 48000 * 4, tempo: 240, playing: true, mode: 'session' as const, peak: .5, peaks: {}, tracks: {}, readouts: {} }
  f.node.port.onmessage({ data: { kind: 'status', status, audioTime: 128 / 48000 } })
  expect(listener).toHaveBeenCalledExactlyOnceWith(status)
  expect(host.recordingBeat()).toBeCloseTo(4)
  f.node.port.onmessage({ data: { kind: 'clock', clock: { beat: 0, tempo: 240, playing: false }, audioTime: 0 } })
  expect(host.recordingBeat()).toBeUndefined()
  expect(listener).toHaveBeenCalledTimes(1)
})
