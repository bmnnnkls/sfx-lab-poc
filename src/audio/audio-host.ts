import type { EngineCommand, EngineStatus } from '@core'
import { type HostMessage, PROCESSOR_NAME, type WorkletMessage } from './protocol'
import { RecordingClock } from './recording-clock'
import workletUrl from './worklet/engine-processor.ts?worker&url'

type StatusListener = (status: EngineStatus) => void
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

  /** Audio-clock bridge: never extrapolate from animation frames or message arrival time. */
  recordingBeat(agoMs = 0): number | undefined {
    if (!this.context || this.context.state !== 'running') return undefined
    return this.clock.beat(this.context.currentTime - agoMs / 1000)
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
