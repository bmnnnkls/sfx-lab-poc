import { framesRead, spectrumHop } from '@core'
import { type SpectrumAnswer, type SpectrumRequest, answerSpectrum } from './spectrum-protocol'

/** A sample's spectrum to compute: its channels (read, never changed), the FFT size, and the columns in order. */
export interface SpectrumJob {
  readonly channels: readonly Float32Array[]
  readonly fftSize: number
  /** Frames between columns: the pyramid's hop (`spectrumHop`) unless a view asks for its own. */
  readonly hop?: number
  readonly chunks: readonly { readonly from: number; readonly to: number }[]
}

/** Base columns `from` up to `to`: per channel, their bytes (`putSpectrumColumns`). */
export interface SpectrumChunk {
  readonly from: number
  readonly to: number
  readonly bytes: readonly Uint8Array[]
}

/** Where spectra are computed: one call, whether a worker or the main thread answers it. */
export interface SpectrumService {
  /** Computes `job`'s chunks in order, `onChunk` for each, `onDone` after the last; returns a cancel. */
  spectrumOf(job: SpectrumJob, onChunk: (chunk: SpectrumChunk) => void, onDone?: () => void): () => void
}

/** Chunks a job has at the worker at once: one computing, one waiting, so the worker never idles between them. */
const IN_FLIGHT = 2

interface Running {
  readonly job: SpectrumJob
  readonly onChunk: (chunk: SpectrumChunk) => void
  readonly onDone?: () => void
  next: number
  inFlight: number
  cancelled: boolean
}

const startWorker = (): Worker | null => {
  if (typeof Worker === 'undefined') return null
  try {
    return new Worker(new URL('./spectrum-worker.ts', import.meta.url), { type: 'module', name: 'spectrum' })
  } catch {
    return null
  }
}

/**
 * The spectrum service: a module worker (`spectrum-worker.ts`), started on the first job and shared by every job, each
 * chunk's frames copied and transferred to it. Where there is no worker (Node, the tests) or it fails, the main thread
 * computes the same chunks (`answerSpectrum`), one per task.
 */
export const createSpectrumService = (makeWorker: () => Worker | null = startWorker): SpectrumService => {
  let worker: Worker | null | undefined
  let nextId = 1
  const requests = new Map<number, { running: Running; chunk: { from: number; to: number } }>()

  const requestOf = (id: number, running: Running, chunk: { from: number; to: number }): { request: SpectrumRequest; transfer: ArrayBuffer[] } => {
    const { channels, fftSize } = running.job
    const hop = running.job.hop ?? spectrumHop(fftSize)
    const read = framesRead({ fftSize, hop, frames: channels[0]?.length ?? 0 }, chunk.from, chunk.to)
    const slices = channels.map((channel) => channel.slice(read.from, Math.max(read.from, read.to)))
    return { request: { id, fftSize, hop, from: chunk.from, to: chunk.to, offset: read.from, channels: slices }, transfer: slices.map((slice) => slice.buffer) }
  }

  const answered = (answer: SpectrumAnswer) => {
    const asked = requests.get(answer.id)
    if (!asked) return
    requests.delete(answer.id)
    const { running } = asked
    running.inFlight--
    if (running.cancelled) return
    running.onChunk({ from: answer.from, to: answer.to, bytes: answer.bytes })
    pump(running)
  }

  const fallBack = (request: SpectrumRequest) => setTimeout(() => answered(answerSpectrum(request)), 0)

  const send = (id: number) => {
    const asked = requests.get(id)!
    const { request, transfer } = requestOf(id, asked.running, asked.chunk)
    if (worker === undefined) {
      worker = makeWorker()
      if (worker) {
        worker.onmessage = (event: MessageEvent<SpectrumAnswer>) => answered(event.data)
        // A worker that fails hands its chunks to the main thread, sliced again (the sent ones were transferred).
        worker.onerror = () => {
          worker?.terminate()
          worker = null
          for (const pending of requests.keys()) fallBack(requestOf(pending, requests.get(pending)!.running, requests.get(pending)!.chunk).request)
        }
      }
    }
    if (worker) worker.postMessage(request, transfer)
    else fallBack(request)
  }

  const pump = (running: Running) => {
    while (!running.cancelled && running.inFlight < IN_FLIGHT && running.next < running.job.chunks.length) {
      const id = nextId++
      requests.set(id, { running, chunk: running.job.chunks[running.next++]! })
      running.inFlight++
      send(id)
    }
    if (!running.cancelled && running.inFlight === 0 && running.next >= running.job.chunks.length) {
      running.cancelled = true
      running.onDone?.()
    }
  }

  return {
    spectrumOf: (job, onChunk, onDone) => {
      const running: Running = { job, onChunk, onDone, next: 0, inFlight: 0, cancelled: false }
      pump(running)
      return () => {
        running.cancelled = true
      }
    },
  }
}
