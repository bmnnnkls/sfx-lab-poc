import { buildSpectrumPyramid, createSpectrumPyramid, putSpectrumColumns, spectrumChunks, type SpectrumPyramid } from '@core'
import { describe, expect, it } from 'vitest'
import { type SpectrumService, createSpectrumService } from './spectrum'
import { type SpectrumRequest, answerSpectrum } from './spectrum-protocol'

const noise = (length: number, seed: number) => {
  let state = seed
  return Float32Array.from({ length }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return (state / 2 ** 31 - 1) * 0.5
  })
}

const AUDIO = { sampleRate: 48000, channels: [noise(150_000, 1), noise(150_000, 2)] }
const FFT = 1024

/** Runs a whole job through `service` into an empty pyramid. */
const fill = (service: SpectrumService) =>
  new Promise<{ pyramid: SpectrumPyramid; chunks: number }>((resolve) => {
    const pyramid = createSpectrumPyramid(150_000, 2, FFT, 48000)
    let chunks = 0
    service.spectrumOf(
      { channels: AUDIO.channels, fftSize: FFT, chunks: spectrumChunks(pyramid, { from: 100_000, to: 120_000 }, 64) },
      (chunk) => {
        chunks++
        putSpectrumColumns(pyramid, chunk.from, chunk.to, chunk.bytes)
      },
      () => resolve({ pyramid, chunks }),
    )
  })

const sameBytes = (a: SpectrumPyramid, b: SpectrumPyramid) => a.levels.every((level, index) => level.data.every((data, channel) => Buffer.from(data).equals(Buffer.from(b.levels[index]!.data[channel]!))))

/** A worker that answers on the next task, as the real one does, keeping what it was sent. */
const fakeWorker = (failAfter = Infinity) => {
  const sent: SpectrumRequest[] = []
  const worker = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    onerror: null as (() => void) | null,
    terminate: () => {},
    postMessage: (request: SpectrumRequest) => {
      sent.push(request)
      if (sent.length > failAfter) return void setTimeout(() => worker.onerror?.(), 0)
      setTimeout(() => worker.onmessage?.({ data: answerSpectrum(request) } as MessageEvent), 0)
    },
  }
  return { worker: worker as unknown as Worker, sent }
}

describe('createSpectrumService', () => {
  const built = buildSpectrumPyramid(AUDIO, FFT)

  it('on the main thread, where there is no worker, fills the same pyramid as a build', async () => {
    const { pyramid, chunks } = await fill(createSpectrumService(() => null))
    expect(chunks).toBe(Math.ceil(built.levels[0]!.count / 64))
    expect(sameBytes(pyramid, built)).toBe(true)
  })

  it('through a worker, sends each chunk only the frames its windows read, at most two at a time', async () => {
    const { worker, sent } = fakeWorker()
    const { pyramid } = await fill(createSpectrumService(() => worker))
    expect(sameBytes(pyramid, built)).toBe(true)
    expect(sent[0]!.channels[0]!.length).toBeLessThanOrEqual(64 * 256 + FFT)
    // The view's chunk first.
    expect(sent[0]!.from).toBe(Math.floor(100_000 / 256 / 64) * 64)
  })

  it('hands a failed worker’s chunks to the main thread', async () => {
    const { worker } = fakeWorker(3)
    const { pyramid } = await fill(createSpectrumService(() => worker))
    expect(sameBytes(pyramid, built)).toBe(true)
  })

  it('stops a cancelled job: no more chunks, and no done', async () => {
    const service = createSpectrumService(() => null)
    let chunks = 0
    let done = false
    const cancel = service.spectrumOf({ channels: AUDIO.channels, fftSize: FFT, chunks: [{ from: 0, to: 10 }, { from: 10, to: 20 }, { from: 20, to: 30 }] }, () => {
      chunks++
      cancel()
    }, () => (done = true))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(chunks).toBe(1)
    expect(done).toBe(false)
  })
})
