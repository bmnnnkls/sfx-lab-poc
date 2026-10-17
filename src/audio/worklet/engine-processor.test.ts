import { afterEach, expect, it, vi } from 'vitest'
import type { WorkletMessage, HostMessage } from '../protocol'
import { RecordingClock } from '../recording-clock'

afterEach(() => vi.unstubAllGlobals())
it('anchors tempo/transport changes at quantum start and periodic beat status at quantum end', async () => {
  const messages: WorkletMessage[] = []
  class Shell {
    port = { onmessage: (_event: { data: HostMessage }) => {}, postMessage: (message: WorkletMessage) => messages.push(message) }
  }
  let Processor: new () => Shell & { process(input: Float32Array[][], output: Float32Array[][]): boolean } = undefined!
  vi.stubGlobal('sampleRate', 8000); vi.stubGlobal('currentTime', 10)
  vi.stubGlobal('AudioWorkletProcessor', Shell)
  vi.stubGlobal('registerProcessor', (_name: string, factory: typeof Processor) => { Processor = factory })
  await import('./engine-processor')
  const processor = new Processor(), output = [[new Float32Array(128), new Float32Array(128)]]
  processor.port.onmessage({ data: { kind: 'command', command: { type: 'transport/play' } } })
  processor.process([], output)
  expect(messages[0]).toMatchObject({ audioTime: 10, status: { beat: 0, tempo: 120, playing: true } })
  expect(messages[1]).toMatchObject({ audioTime: 10.016, status: { beat: 0.032, tempo: 120 } })
  vi.stubGlobal('currentTime', 10.016)
  processor.port.onmessage({ data: { kind: 'command', command: { type: 'transport/setTempo', bpm: 60 } } })
  processor.process([], output)
  expect(messages[2]).toMatchObject({ audioTime: 10.016, status: { beat: 0.032, tempo: 60 } })
  const clock = new RecordingClock()
  for (const message of messages) clock.update(message.status, message.audioTime!)
  expect(clock.beat(10.012)).toBeCloseTo(0.024)
  expect(clock.beat(10.024)).toBeCloseTo(0.04)
})
