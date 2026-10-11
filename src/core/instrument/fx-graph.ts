import { type NoteState, STEREO_FRAMES, type SendSink, type SignalTaps } from '../dsp'
import { type Patch, topologicalOrder } from '../patch'
import type { SampleLookup } from '../sample'
import { addInto, compileStage, processStage, setStageParam, setStageSample, stageReadouts } from './compile'

/** An insert graph has no note of its own; the few nodes that look at one see a silent, ungated note. */
const NO_NOTE: Readonly<NoteState> = { frequency: 0, velocity: 0, gate: false, trigger: 0 }

/**
 * A track's insert graph, running: the track's sound goes in at `Track in` (mono; a return track's stereo sum at
 * `Return in`), through whatever is wired up, and
 * what reaches `Track out` comes back as a stereo buffer (a mono signal is heard in both channels). Unlike an
 * instrument it keeps one copy of every node (no voices), so reverb tails and filter state carry on from block to
 * block, and a knob change keeps them.
 */
export class FxGraph {
  private readonly stage: ReturnType<typeof compileStage>
  private readonly out = new Float32Array(STEREO_FRAMES)

  constructor(
    patch: Patch,
    private readonly sampleRate: number,
    private readonly samples: SampleLookup,
  ) {
    this.stage = compileStage(patch, topologicalOrder(patch) ?? [], sampleRate)
  }

  setParam(nodeId: string, paramId: string, value: number): void {
    setStageParam(this.stage, nodeId, paramId, value)
  }

  /** What the graph's indicators show right now, by node id. */
  readouts(): Record<string, number> {
    const found: Record<string, number> = {}
    stageReadouts(this.stage, found)
    return found
  }

  setSample(nodeId: string, sampleId: string | null): void {
    setStageSample(this.stage, nodeId, sampleId)
  }

  /**
   * Runs `frames` samples (<= MAX_BLOCK_FRAMES) of `input` through the graph and returns the shared stereo output
   * buffer (left channel first, then right; see `dsp/stereo.ts`). Send nodes add to the return tracks through `boards.sends`, Track audio nodes read other tracks through `boards.taps`.
   */
  process(input: Float32Array, frames: number, boards: { sends?: SendSink; taps?: SignalTaps } = {}): Float32Array {
    processStage(this.stage, { frames, sampleRate: this.sampleRate, note: NO_NOTE, samples: this.samples, input, sends: boards.sends, taps: boards.taps })
    this.out.fill(0)
    for (const source of this.stage.outputSources) addInto(this.out, source, frames)
    return this.out
  }
}
