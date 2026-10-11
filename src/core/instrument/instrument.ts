import { type NoteState } from '../dsp'
import { midiToFrequency } from '../shared'
import type { Patch } from '../patch'
import { type CompiledPatch, MAX_BLOCK_FRAMES, compilePatch } from './compile'

/**
 * A monophonic (last-note-priority) synth voice built from a patch.
 * Renders a mono signal; the mixer decides placement.
 */
export class Instrument {
  private readonly compiled: CompiledPatch
  private readonly note: NoteState = { frequency: 440, velocity: 0, gate: false }
  private readonly heldPitches: number[] = []
  private readonly mixBuffer = new Float32Array(MAX_BLOCK_FRAMES)

  constructor(
    patch: Patch,
    private readonly sampleRate: number,
  ) {
    this.compiled = compilePatch(patch, sampleRate)
  }

  noteOn(pitch: number, velocity = 1): void {
    this.heldPitches.push(pitch)
    this.note.frequency = midiToFrequency(pitch)
    this.note.velocity = velocity
    this.note.gate = true
  }

  noteOff(pitch: number): void {
    const index = this.heldPitches.lastIndexOf(pitch)
    if (index >= 0) this.heldPitches.splice(index, 1)

    const previous = this.heldPitches[this.heldPitches.length - 1]
    if (previous === undefined) {
      this.note.gate = false
    } else {
      this.note.frequency = midiToFrequency(previous)
    }
  }

  allNotesOff(): void {
    this.heldPitches.length = 0
    this.note.gate = false
  }

  setParam(nodeId: string, paramId: string, value: number): void {
    this.compiled.byId.get(nodeId)?.setParam(paramId, value)
  }

  /** Renders `frames` samples (<= MAX_BLOCK_FRAMES) and returns the shared mono buffer. */
  render(frames: number): Float32Array {
    const context = { frames, sampleRate: this.sampleRate, note: this.note }

    for (const node of this.compiled.nodes) {
      for (const { target, sources } of node.sums) {
        target.fill(0, 0, frames)
        for (const source of sources) {
          for (let i = 0; i < frames; i++) target[i] = (target[i] ?? 0) + (source[i] ?? 0)
        }
      }
      node.dsp.process(context, node.inputs, node.outputs)
    }

    this.mixBuffer.fill(0, 0, frames)
    for (const source of this.compiled.outputSources) {
      for (let i = 0; i < frames; i++) {
        this.mixBuffer[i] = (this.mixBuffer[i] ?? 0) + (source[i] ?? 0)
      }
    }
    return this.mixBuffer
  }
}
