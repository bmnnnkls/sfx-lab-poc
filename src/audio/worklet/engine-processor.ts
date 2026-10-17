import { Engine } from '@core'
import { type HostMessage, PROCESSOR_NAME, type WorkletMessage } from '../protocol'

const STATUS_INTERVAL_SECONDS = 1 / 30

/** Thin AudioWorklet shell: forwards commands to the Engine and pulls audio from it. */
class EngineProcessor extends AudioWorkletProcessor {
  private readonly engine = new Engine(sampleRate)
  private framesSinceStatus = 0
  private clockChanged = true

  constructor() {
    super()
    this.port.onmessage = (event: MessageEvent<HostMessage>) => {
      if (event.data.kind === 'command') {
        this.engine.apply(event.data.command)
        const type = event.data.command.type
        if (type.startsWith('transport/') || type.endsWith('/launch')) this.clockChanged = true
      }
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const [left, right] = outputs[0] ?? []
    if (!left || !right) return true

    if (this.clockChanged) {
      // Stamp tempo/transport changes at the next quantum's start, before its beats advance.
      this.port.postMessage({ kind: 'status', status: this.engine.status(), audioTime: currentTime } satisfies WorkletMessage)
      this.clockChanged = false
      this.framesSinceStatus = sampleRate * STATUS_INTERVAL_SECONDS
    }
    this.engine.render(left, right)
    this.reportStatus(left.length)
    return true
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
