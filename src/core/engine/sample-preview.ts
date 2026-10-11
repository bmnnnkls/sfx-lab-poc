import type { SampleData } from '../sample'

/** Plays one sample straight to the master output so a user can audition it. Not part of any track. */
export class SamplePreview {
  private sample: SampleData | null = null
  private position = 0

  constructor(
    private readonly sampleRate: number,
    private readonly level = 0.8,
  ) {}

  start(sample: SampleData): void {
    this.sample = sample
    this.position = 0
  }

  stop(): void {
    this.sample = null
  }

  /** Adds the next `left.length` samples of the preview into the stereo buffers. */
  mixInto(left: Float32Array, right: Float32Array): void {
    const sample = this.sample
    if (!sample) return
    const speed = sample.sampleRate / this.sampleRate
    const length = sample.data.length

    for (let i = 0; i < left.length; i++) {
      const index = Math.floor(this.position)
      if (index >= length) {
        this.sample = null
        return
      }
      const fraction = this.position - index
      const a = sample.data[index] ?? 0
      const b = sample.data[index + 1] ?? 0
      const value = (a + (b - a) * fraction) * this.level
      left[i] = (left[i] ?? 0) + value
      right[i] = (right[i] ?? 0) + value
      this.position += speed
    }
  }
}
