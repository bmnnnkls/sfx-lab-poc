import type { SampleData, SampleLookup, SampleLoop } from './types'

/**
 * Decoded samples held by the audio engine, and their loops. Loops are kept apart from the audio, so a loop may arrive
 * before its sample's audio (a bounce sends the project first) and outlives a `sample/add` of the same id.
 */
export class SampleBank implements SampleLookup {
  private readonly samples = new Map<string, SampleData>()
  private readonly loops = new Map<string, SampleLoop>()

  set(sample: SampleData): void {
    this.samples.set(sample.id, sample)
  }

  get(id: string): SampleData | undefined {
    return this.samples.get(id)
  }

  delete(id: string): void {
    this.samples.delete(id)
  }

  /** Sets or clears (null) a sample's loop. */
  setLoop(id: string, loop: SampleLoop | null): void {
    if (loop) this.loops.set(id, loop)
    else this.loops.delete(id)
  }

  loopOf(id: string): SampleLoop | undefined {
    return this.loops.get(id)
  }
}
