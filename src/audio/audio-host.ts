import type { EngineCommand, EngineStatus } from '@core'
import { type HostMessage, PROCESSOR_NAME, type WorkletMessage } from './protocol'
import { RecordingClock } from './recording-clock'
import workletUrl from './worklet/engine-processor.ts?worker&url'

type StatusListener = (status: EngineStatus) => void

/** How many recent reads the render clock's lead over the output is taken from (about two seconds of statuses). */
const LEAD_SAMPLES = 64
/** The most the smoothed render time is from `currentTime`: more than any output callback. */
const MAX_STEP_SECONDS = 0.025

/**
 * How far the render clock runs ahead of the output clock, from recent readings of `currentTime` minus the output
 * clock. A reading is short of the true lead by however far into its step `currentTime` was, spread evenly over a
 * step, so the true lead is the top of that spread: the median plus half the spread, from the 10th to the 90th
 * percentile (80 % of a step). Percentiles, not the largest reading, so a late callback that ran two steps at once
 * doesn't move the clock.
 */
const remember = (readings: number[], reading: number) => {
  readings.push(reading)
  if (readings.length > LEAD_SAMPLES) readings.shift()
}
const median = (readings: readonly number[]) => [...readings].sort((a, b) => a - b)[Math.floor(readings.length / 2)]!

export const renderLead = (readings: readonly number[]): number => {
  const sorted = [...readings].sort((a, b) => a - b)
  if (sorted.length < 10) return sorted.at(-1) ?? 0
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!
  return at(0.5) + (at(0.9) - at(0.1)) / 1.6
}
type FailureListener = (error: Error) => void

/**
 * Owns the AudioContext and the engine worklet. Commands sent before `start()` are
 * queued and replayed in order, so callers never need to care whether audio is running.
 */
export class AudioHost {
  private context: AudioContext | null = null
  private node: AudioWorkletNode | null = null
  private starting: Promise<void> | null = null
  private startupFailure: Error | null = null
  private readonly queue: Array<{ command: EngineCommand; transfer: Transferable[] }> = []
  private readonly listeners = new Set<StatusListener>()
  private readonly failureListeners = new Set<FailureListener>()

  private readonly clock = new RecordingClock()
  /** Recent readings of how far `currentTime` was ahead of the output clock, and of the output clock's offset from `performance.now()`. */
  private readonly leads: number[] = []
  private readonly offsets: number[] = []
  /** Recent readings of the output latency. */
  private readonly latencies: number[] = []

  /** Audio-clock bridge: never extrapolate from animation frames or message arrival time. */
  recordingBeat(agoMs = 0): number | undefined {
    if (!this.context || this.context.state !== 'running') return undefined
    return this.clock.beat(this.audioNow() - agoMs / 1000)
  }

  /**
   * The context's render time now. `currentTime` moves in steps of the output's callback (256 frames, 5 ms, or more),
   * so it is read through the output timestamp, which pairs the audio clock with `performance.now()`, plus how far
   * `currentTime` runs ahead of that (`renderLead`). A pair read at a callback's edge can be a callback off, so the
   * clocks' offset is the median of recent pairs. Where the browser has no output timestamp, `currentTime`.
   */
  private audioNow(): number {
    const context = this.context!
    const current = context.currentTime
    const stamp = typeof context.getOutputTimestamp === 'function' ? context.getOutputTimestamp() : undefined
    if (!stamp || stamp.contextTime === undefined || stamp.performanceTime === undefined || !(stamp.performanceTime > 0)) return current
    const now = performance.now() / 1000
    remember(this.offsets, stamp.contextTime - stamp.performanceTime / 1000)
    const output = median(this.offsets) + now
    remember(this.leads, current - output)
    // Never more than a callback or two from `currentTime`, which itself runs ahead when a late callback renders twice.
    return Math.min(current + MAX_STEP_SECONDS, Math.max(current - MAX_STEP_SECONDS, output + renderLead(this.leads)))
  }

  /**
   * How long after the engine renders a sample it is heard, in seconds: the context's output latency plus its base
   * latency, each 0 where the browser doesn't report it. Read when asked, since it changes with the output device, and
   * taken as the median of recent readings, since a browser's estimate can flip between values a callback apart.
   */
  outputLatency(): number {
    const reading = this.latencyNow()
    if (reading === undefined) return 0
    if (this.latencies.length === 0) remember(this.latencies, reading)
    return median(this.latencies)
  }

  private latencyNow(): number | undefined {
    const context = this.context
    if (!context) return undefined
    const seconds = (value: number | undefined) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0)
    return seconds(context.outputLatency) + seconds(context.baseLatency)
  }

  get isRunning(): boolean {
    return this.context?.state === 'running'
  }

  /**
   * Must be called from a user gesture the first time (browser autoplay policy).
   * Resolves when the startup attempt settles; callers must use `onFailure` to detect
   * a terminal failure because this promise deliberately never rejects.
   */
  start(): Promise<void> {
    if (this.startupFailure) return Promise.resolve()
    this.starting ??= this.boot().catch((error: unknown) => { this.fail(error) })
    return this.starting.then(async () => {
      if (this.startupFailure || !this.context) return
      try {
        await this.context.resume()
      } catch (error) {
        this.fail(error)
        await this.closeAfterFailure()
      }
    })
  }

  /** `transfer` lists buffers to hand over to the audio thread without copying (they become unusable here). */
  send(command: EngineCommand, transfer: Transferable[] = []): void {
    // A failed preparation may already have detached sample buffers from the main thread.
    // The engine mirror cannot be rebuilt safely without reloading/resynchronizing the project.
    if (this.startupFailure) return
    if (!this.node) {
      this.queue.push({ command, transfer })
      return
    }
    const message: HostMessage = { kind: 'command', command }
    this.node.port.postMessage(message, transfer)
  }

  onStatus(listener: StatusListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  onFailure(listener: FailureListener): () => void {
    this.failureListeners.add(listener)
    if (this.startupFailure) {
      try { listener(this.startupFailure) } catch (error) { console.error('Audio failure listener failed', error) }
    }
    return () => this.failureListeners.delete(listener)
  }

  private async boot(): Promise<void> {
    const context = new AudioContext({ latencyHint: 'interactive' })
    try {
      // A disconnected running worklet can still process. Suspension and the processor's ready guard
      // jointly prevent the audible engine's clocks from advancing during preparation.
      await context.suspend()
      await context.audioWorklet.addModule(workletUrl)
      const node = new AudioWorkletNode(context, PROCESSOR_NAME, { outputChannelCount: [2] })
      let resolveReady!: () => void, rejectReady!: (error: Error) => void
      const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject })
      node.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
        if (event.data.kind === 'ready') { resolveReady(); return }
        if (event.data.kind === 'preparation-error') { rejectReady(new Error(event.data.message)); return }
        if (event.data.kind === 'clock') { this.clock.update(event.data.clock, event.data.audioTime); return }
        if (event.data.kind !== 'status') return
        if (event.data.audioTime !== undefined) this.clock.update(event.data.status, event.data.audioTime)
        // Each status also samples the clocks and the latency, so a MIDI event finds them warm.
        if (this.context) {
          this.audioNow()
          const latency = this.latencyNow()
          if (latency !== undefined) remember(this.latencies, latency)
        }
        for (const listener of this.listeners) listener(event.data.status)
      }
      node.onprocessorerror = (event) => {
        console.error('Audio engine stopped unexpectedly', event)
        const error = new Error('Audio engine stopped unexpectedly')
        rejectReady(error)
        if (this.context) {
          this.fail(error)
          void this.closeAfterFailure()
        }
      }
      // Keep send() queued until ready, including commands arriving while the temporary engine runs.
      for (const { command, transfer } of this.queue.splice(0)) node.port.postMessage({ kind: 'command', command } satisfies HostMessage, transfer)
      node.port.postMessage({ kind: 'prepare' } satisfies HostMessage)
      await ready
      this.context = context
      this.node = node
      for (const { command, transfer } of this.queue.splice(0)) this.send(command, transfer)
      node.connect(context.destination)
    } catch (error) {
      this.fail(error)
      try { await context.close() } catch { /* Preserve the preparation error shown to the user. */ }
      throw error
    }
  }

  private async closeAfterFailure(): Promise<void> {
    const context = this.context
    this.context = null
    this.node = null
    if (context) {
      try { await context.close() } catch { /* The original startup error is more useful. */ }
    }
  }

  private fail(reason: unknown): void {
    if (this.startupFailure) return
    const error = reason instanceof Error ? reason : new Error(String(reason))
    this.startupFailure = error
    this.queue.length = 0
    for (const listener of this.failureListeners) {
      try { listener(error) } catch (listenerError) { console.error('Audio failure listener failed', listenerError) }
    }
  }
}
