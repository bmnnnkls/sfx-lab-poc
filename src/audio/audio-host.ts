import type { EngineCommand, EngineStatus } from '@core'
import { type HostMessage, PROCESSOR_NAME, type WorkletMessage } from './protocol'
import workletUrl from './worklet/engine-processor.ts?worker&url'

type StatusListener = (status: EngineStatus) => void

/**
 * Owns the AudioContext and the engine worklet. Commands sent before `start()` are
 * queued and replayed in order, so callers never need to care whether audio is running.
 */
export class AudioHost {
  private context: AudioContext | null = null
  private node: AudioWorkletNode | null = null
  private starting: Promise<void> | null = null
  private readonly queue: EngineCommand[] = []
  private readonly listeners = new Set<StatusListener>()

  get isRunning(): boolean {
    return this.context?.state === 'running'
  }

  /** Must be called from a user gesture the first time (browser autoplay policy). */
  start(): Promise<void> {
    this.starting ??= this.boot()
    return this.starting.then(() => this.context?.resume()).then(() => undefined)
  }

  send(command: EngineCommand): void {
    if (!this.node) {
      this.queue.push(command)
      return
    }
    const message: HostMessage = { kind: 'command', command }
    this.node.port.postMessage(message)
  }

  onStatus(listener: StatusListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private async boot(): Promise<void> {
    const context = new AudioContext({ latencyHint: 'interactive' })
    await context.audioWorklet.addModule(workletUrl)

    const node = new AudioWorkletNode(context, PROCESSOR_NAME, { outputChannelCount: [2] })
    node.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
      if (event.data.kind !== 'status') return
      for (const listener of this.listeners) listener(event.data.status)
    }
    node.connect(context.destination)

    this.context = context
    this.node = node
    for (const command of this.queue.splice(0)) this.send(command)
  }
}
