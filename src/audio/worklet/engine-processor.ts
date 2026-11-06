import { Engine, type EngineCommand } from '@core'
import { type HostMessage, PROCESSOR_NAME, type WorkletMessage } from '../protocol'
import { prepareEngine } from './prepare-engine'

const STATUS_INTERVAL_SECONDS = 1 / 30

/** Thin AudioWorklet shell: forwards commands to the Engine and pulls audio from it. */
class EngineProcessor extends AudioWorkletProcessor {
  private readonly engine = new Engine(sampleRate)
  private framesSinceStatus = 0
  private clockChanged = true
  private initialCommands: EngineCommand[] | null = []
  private prepared = false
  private preparationError: string | null = null

  constructor() {
    super()
    this.port.onmessage = (event: MessageEvent<HostMessage>) => {
      if (event.data.kind === 'command') {
        this.engine.apply(event.data.command)
        this.initialCommands?.push(event.data.command)
        const type = event.data.command.type
        if (type.startsWith('transport/') || type.startsWith('arrangement/') || type.endsWith('/launch')) this.clockChanged = true
      } else if (event.data.kind === 'prepare') {
        this.prepare()
      }
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const [left, right] = outputs[0] ?? []
    if (!left || !right) return true
    if (!this.prepared) { left.fill(0); right.fill(0); return true }

    if (this.clockChanged) {
      // Stamp tempo/transport changes at the next quantum's start, before its beats advance.
      this.port.postMessage({ kind: 'clock', clock: this.engine.clock(), audioTime: currentTime } satisfies WorkletMessage)
      this.clockChanged = false
      this.framesSinceStatus = sampleRate * STATUS_INTERVAL_SECONDS
    }
    this.engine.render(left, right)
    // A loop jump, or the start after a count-in, is stamped with its own frame's time, so the recording clock maps a
    // note or a touch to the right beat.
    const jump = this.engine.lastClockEdge()
    if (jump) this.port.postMessage({ kind: 'clock', clock: { ...this.engine.clock(), beat: jump.beat }, audioTime: currentTime + jump.frame / sampleRate } satisfies WorkletMessage)
    this.reportStatus(left.length)
    return true
  }

  private prepare(): void {
    if (this.preparationError !== null) {
      this.port.postMessage({ kind: 'preparation-error', message: this.preparationError } satisfies WorkletMessage)
      return
    }
    try {
      if (!this.prepared) {
        prepareEngine(this.initialCommands ?? [], sampleRate)
        this.engine.prepareTopology()
        this.prepared = true
      }
      this.port.postMessage({ kind: 'ready' } satisfies WorkletMessage)
    } catch (error) {
      this.preparationError = error instanceof Error ? error.message : String(error)
      this.port.postMessage({ kind: 'preparation-error', message: this.preparationError } satisfies WorkletMessage)
    } finally { this.initialCommands = null }
  }

  private reportStatus(frames: number): void {
    this.framesSinceStatus += frames
    if (this.framesSinceStatus < sampleRate * STATUS_INTERVAL_SECONDS) return
    this.framesSinceStatus = 0
    const message: WorkletMessage = { kind: 'status', status: this.engine.status(), audioTime: currentTime + frames / sampleRate }
    this.port.postMessage(message)
  }
}

registerProcessor(PROCESSOR_NAME, EngineProcessor)
