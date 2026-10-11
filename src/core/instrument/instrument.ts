import { type NoteState } from '../dsp'
import type { Patch } from '../patch'
import type { SampleLookup } from '../sample'
import { MAX_BLOCK_FRAMES, compileStage, processStage, setStageParam, setStageSample } from './compile'
import { planStages } from './stages'
import { Voice } from './voice'
import { VoicePool } from './voice-pool'

/** Shared-stage nodes have no note of their own; they see a silent, ungated one. */
const NO_NOTE: Readonly<NoteState> = { frequency: 0, velocity: 0, gate: false, trigger: 0 }

/**
 * A polyphonic synth built from a patch. The patch is split in two (see `planStages`):
 * voice nodes are instantiated once per voice, shared nodes (effects) once, fed by the
 * sum of all voices. Renders a mono signal; the mixer decides placement.
 */
export class Instrument {
  private readonly pool: VoicePool
  private readonly shared: ReturnType<typeof compileStage>
  private readonly boundaries: ReadonlyArray<{ key: string; buffer: Float32Array }>
  private readonly mix = new Float32Array(MAX_BLOCK_FRAMES)

  constructor(
    patch: Patch,
    private readonly sampleRate: number,
    voiceCount: number,
    private readonly samples: SampleLookup,
  ) {
    const plan = planStages(patch)

    this.boundaries = plan.boundaries.map((key) => ({ key, buffer: new Float32Array(MAX_BLOCK_FRAMES) }))
    this.shared = compileStage(
      patch,
      plan.sharedOrder,
      sampleRate,
      new Map(this.boundaries.map(({ key, buffer }) => [key, buffer])),
    )

    this.pool = new VoicePool(
      Array.from(
        { length: Math.max(1, Math.floor(voiceCount)) },
        () =>
          new Voice(
            compileStage(patch, plan.voiceOrder, sampleRate),
            plan.boundaries,
            sampleRate,
            samples,
          ),
      ),
    )
  }

  get activeVoiceCount(): number {
    return this.pool.activeCount
  }

  noteOn(pitch: number, velocity = 1): void {
    this.pool.noteOn(pitch, velocity)
  }

  noteOff(pitch: number): void {
    this.pool.noteOff(pitch)
  }

  /** Releases every held note (their envelopes still fade out naturally). */
  allNotesOff(): void {
    this.pool.releaseAll()
  }

  setParam(nodeId: string, paramId: string, value: number): void {
    for (const voice of this.pool.voices) voice.setParam(nodeId, paramId, value)
    setStageParam(this.shared, nodeId, paramId, value)
  }

  setSample(nodeId: string, sampleId: string | null): void {
    for (const voice of this.pool.voices) voice.setSample(nodeId, sampleId)
    setStageSample(this.shared, nodeId, sampleId)
  }

  /** Renders `frames` samples (<= MAX_BLOCK_FRAMES) and returns the shared mono buffer. */
  render(frames: number): Float32Array {
    this.mix.fill(0, 0, frames)
    for (const { buffer } of this.boundaries) buffer.fill(0, 0, frames)

    for (const voice of this.pool.voices) {
      if (!voice.active) continue
      voice.render(frames)
      for (const source of voice.outputSources) this.accumulate(this.mix, source, frames)
      for (const { key, buffer } of this.boundaries) {
        const signal = voice.boundaryBuffer(key)
        if (signal) this.accumulate(buffer, signal, frames)
      }
    }

    processStage(this.shared, {
      frames,
      sampleRate: this.sampleRate,
      note: NO_NOTE,
      samples: this.samples,
    })
    for (const source of this.shared.outputSources) this.accumulate(this.mix, source, frames)
    return this.mix
  }

  private accumulate(target: Float32Array, source: Float32Array, frames: number): void {
    for (let i = 0; i < frames; i++) target[i] = (target[i] ?? 0) + (source[i] ?? 0)
  }
}
