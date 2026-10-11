import { type NoteState } from '../dsp'
import type { Patch } from '../patch'
import type { SampleLookup } from '../sample'
import { MAX_BLOCK_FRAMES, compileStage, processStage, setStageParam, setStageSample, stageReadouts } from './compile'
import { planStages } from './stages'
import { Voice } from './voice'
import { VoicePool } from './voice-pool'

/** Shared-stage nodes have no note of their own; they see a silent, ungated one. */
const NO_NOTE: Readonly<NoteState> = { frequency: 0, velocity: 0, gate: false, trigger: 0 }

/**
 * A polyphonic synth built from a patch. The patch is split in three (see `planStages`):
 * voice nodes are instantiated once per voice, shared nodes (effects) once, fed by the
 * sum of all voices, and global nodes (controls and the math on them) once per block, read by both.
 * Renders a mono signal; the mixer decides placement.
 */
export class Instrument {
  private readonly pool: VoicePool
  private readonly global: ReturnType<typeof compileStage>
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

    // The global stage is compiled first: its buffers are what the other two stages read, shared by all voices.
    this.global = compileStage(patch, plan.globalOrder, sampleRate)
    const globalBuffers = this.global.outputBuffers

    this.boundaries = plan.boundaries.map((key) => ({ key, buffer: new Float32Array(MAX_BLOCK_FRAMES) }))
    this.shared = compileStage(
      patch,
      plan.sharedOrder,
      sampleRate,
      new Map([...globalBuffers, ...this.boundaries.map(({ key, buffer }) => [key, buffer] as const)]),
    )

    this.pool = new VoicePool(
      Array.from(
        { length: Math.max(1, Math.floor(voiceCount)) },
        (_, slot) =>
          new Voice(
            // The slot is the voice's salt: it depends only on the order of the notes, so a render is still the same every time.
            compileStage(patch, plan.voiceOrder, sampleRate, globalBuffers, slot),
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
    setStageParam(this.global, nodeId, paramId, value)
    setStageParam(this.shared, nodeId, paramId, value)
  }

  setSample(nodeId: string, sampleId: string | null): void {
    for (const voice of this.pool.voices) voice.setSample(nodeId, sampleId)
    setStageSample(this.shared, nodeId, sampleId)
  }

  /**
   * What the patch's indicators show right now, by node id: the global and shared ones always, those in the voices only while a voice
   * sounds (the latest sounding voice wins), so an indicator in a silent instrument is absent rather than stale.
   */
  readouts(): Record<string, number> {
    const found: Record<string, number> = {}
    stageReadouts(this.global, found)
    stageReadouts(this.shared, found)
    for (const voice of this.pool.voices) if (voice.active) voice.readouts(found)
    return found
  }

  /** Renders `frames` samples (<= MAX_BLOCK_FRAMES) and returns the shared mono buffer. */
  render(frames: number): Float32Array {
    this.mix.fill(0, 0, frames)
    for (const { buffer } of this.boundaries) buffer.fill(0, 0, frames)

    // Every block, voices or not: a smoothing node keeps its state, and the voices read the buffers it fills.
    processStage(this.global, { frames, sampleRate: this.sampleRate, note: NO_NOTE, samples: this.samples })
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
