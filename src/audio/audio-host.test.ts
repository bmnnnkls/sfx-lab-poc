import { afterEach, expect, it, vi } from 'vitest'
import type { HostMessage, WorkletMessage } from './protocol'
import { AudioHost } from './audio-host'

afterEach(() => vi.unstubAllGlobals())
const fixture = () => {
  const order: string[] = []
  const sent: HostMessage[] = []
  class Context {
    state = 'running'
    currentTime = 0
    destination = {}
    audioWorklet = { addModule: async () => { order.push('module') } }
    async suspend() { order.push('suspend'); this.state = 'suspended' }
    async resume() { order.push('resume'); this.state = 'running' }
    async close() { order.push('close'); this.state = 'closed' }
  }
  let node!: Node
  class Node {
    onprocessorerror?: () => void
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
  return { order, sent, get node() { return node } }
}

it('keeps the context suspended and later commands queued until ready; transfers initial samples once', async () => {
  const f = fixture(), host = new AudioHost(), bytes = new Float32Array([.1,.2,.3])
  host.send({ type: 'sample/add', sample: { id: 'asset', sampleRate: 48000, data: bytes } }, [bytes.buffer])
  const starting = host.start()
  await vi.waitFor(() => expect(f.order).toContain('prepare'))
  expect(bytes.byteLength).toBe(0)
  expect(f.sent[0]).toMatchObject({ kind: 'command', command: { type: 'sample/add', sample: { data: new Float32Array([.1,.2,.3]) } } })
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

it('surfaces preparation failure and closes the suspended context without connecting or resuming', async () => {
  const f = fixture(), host = new AudioHost()
  const starting = host.start(), rejected = expect(starting).rejects.toThrow('fixture failed')
  await vi.waitFor(() => expect(f.order).toContain('prepare'))
  f.node.port.onmessage({ data: { kind: 'preparation-error', message: 'fixture failed' } })
  await rejected
  expect(f.order).toEqual(['suspend','module','prepare','close'])
  expect(host.isRunning).toBe(false)
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
  const status = { beat: 4 + 128 / 48000 * 4, tempo: 240, playing: true, peak: .5, peaks: {}, tracks: {}, readouts: {} }
  f.node.port.onmessage({ data: { kind: 'status', status, audioTime: 128 / 48000 } })
  expect(listener).toHaveBeenCalledExactlyOnceWith(status)
  expect(host.recordingBeat()).toBeCloseTo(4)
  f.node.port.onmessage({ data: { kind: 'clock', clock: { beat: 0, tempo: 240, playing: false }, audioTime: 0 } })
  expect(host.recordingBeat()).toBeUndefined()
  expect(listener).toHaveBeenCalledTimes(1)
})
