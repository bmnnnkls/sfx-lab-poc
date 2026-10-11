import { type NoteState } from '../dsp'
import type { SampleLookup } from '../sample'
import { midiToFrequency } from '../shared'
import { type CompiledStage, processStage } from './compile'

/** Below this peak level (about -80 dB) a released voice counts as silent. */
const SILENCE_LEVEL = 1e-4
/** A released voice must stay silent this long before it is given up. */
const SILENT_SECONDS = 0.05
/** Safety net: free a released voice even if it never goes quiet (e.g. a patch with no envelope). */
const MAX_RELEASE_SECONDS = 10

/** One note's worth of the patch's voice stage, plus the bookkeeping to know when it is done. */
export class Voice {
  active = false
  released = false
  pitch = -1
  /** Allocation order, used to steal the oldest voice. */
  startedAt = 0

  private readonly note: NoteState = { frequency: 440, velocity: 0, gate: false, trigger: 0 }
  private readonly sinks: readonly Float32Array[]
  private silentFrames = 0
  private releasedFrames = 0

  constructor(
    private readonly stage: CompiledStage,
    boundaryKeys: readonly string[],
    private readonly sampleRate: number,
    private readonly samples: SampleLookup,
  ) {
    this.sinks = [
      ...stage.outputSources,
      ...boundaryKeys.flatMap((key) => stage.outputBuffers.get(key) ?? []),
    ]
  }

  /** Buffers carrying this voice's audible output (voice-stage Output nodes). */
  get outputSources(): readonly Float32Array[] {
    return this.stage.outputSources
  }

  /** This voice's buffer for a voice -> shared boundary signal. */
  boundaryBuffer(key: string): Float32Array | undefined {
    return this.stage.outputBuffers.get(key)
  }

  start(pitch: number, velocity: number, startedAt: number): void {
    this.active = true
    this.released = false
    this.pitch = pitch
    this.startedAt = startedAt
    this.note.frequency = midiToFrequency(pitch)
    this.note.velocity = velocity
    this.note.gate = true
    this.note.trigger++
    this.silentFrames = 0
    this.releasedFrames = 0
  }

  release(): void {
    if (!this.active || this.released) return
    this.released = true
    this.note.gate = false
  }

  setParam(nodeId: string, paramId: string, value: number): void {
    this.stage.byId.get(nodeId)?.setParam(paramId, value)
  }

  setSample(nodeId: string, sampleId: string | null): void {
    this.stage.byId.get(nodeId)?.setSample?.(sampleId)
  }

  render(frames: number): void {
    processStage(this.stage, {
      frames,
      sampleRate: this.sampleRate,
      note: this.note,
      samples: this.samples,
    })
    if (this.released) this.checkFinished(frames)
  }

  private checkFinished(frames: number): void {
    this.releasedFrames += frames
    this.silentFrames = this.peak(frames) < SILENCE_LEVEL ? this.silentFrames + frames : 0

    const silentLongEnough = this.silentFrames >= this.sampleRate * SILENT_SECONDS
    const releasedTooLong = this.releasedFrames >= this.sampleRate * MAX_RELEASE_SECONDS
    if (silentLongEnough || releasedTooLong) this.active = false
  }

  private peak(frames: number): number {
    let peak = 0
    for (const sink of this.sinks) {
      for (let i = 0; i < frames; i++) peak = Math.max(peak, Math.abs(sink[i] ?? 0))
    }
    return peak
  }
}
