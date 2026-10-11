import { type NoteState } from '../dsp'
import { type Patch, topologicalOrder } from '../patch'
import type { SampleLookup } from '../sample'
import { MAX_BLOCK_FRAMES, compileStage, processStage } from './compile'

/** An insert graph has no note of its own; the few nodes that look at one see a silent, ungated note. */
const NO_NOTE: Readonly<NoteState> = { frequency: 0, velocity: 0, gate: false, trigger: 0 }

/**
 * A track's insert graph, running: the track's sound goes in at `Track in`, through whatever is wired up, and
 * what reaches `Track out` comes back. Unlike an instrument it keeps one copy of every node (no voices), so
 * reverb tails and filter state carry on from block to block, and a knob change keeps them.
 */
export class FxGraph {
  private readonly stage: ReturnType<typeof compileStage>
  private readonly out = new Float32Array(MAX_BLOCK_FRAMES)

  constructor(
    patch: Patch,
    private readonly sampleRate: number,
    private readonly samples: SampleLookup,
  ) {
    this.stage = compileStage(patch, topologicalOrder(patch) ?? [], sampleRate)
  }

  setParam(nodeId: string, paramId: string, value: number): void {
    this.stage.byId.get(nodeId)?.setParam(paramId, value)
  }

  setSample(nodeId: string, sampleId: string | null): void {
    this.stage.byId.get(nodeId)?.setSample?.(sampleId)
  }

  /** Runs `frames` samples (<= MAX_BLOCK_FRAMES) of `input` through the graph and returns the shared output buffer. */
  process(input: Float32Array, frames: number): Float32Array {
    processStage(this.stage, { frames, sampleRate: this.sampleRate, note: NO_NOTE, samples: this.samples, input })
    this.out.fill(0, 0, frames)
    for (const source of this.stage.outputSources) {
      for (let i = 0; i < frames; i++) this.out[i] = (this.out[i] ?? 0) + (source[i] ?? 0)
    }
    return this.out
  }
}
