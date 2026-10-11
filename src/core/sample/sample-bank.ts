import type { SampleData, SampleLookup } from './types'

/** Decoded samples held by the audio engine. */
export class SampleBank implements SampleLookup {
  private readonly samples = new Map<string, SampleData>()

  set(sample: SampleData): void {
    this.samples.set(sample.id, sample)
  }

  get(id: string): SampleData | undefined {
    return this.samples.get(id)
  }

  delete(id: string): void {
    this.samples.delete(id)
  }
}
