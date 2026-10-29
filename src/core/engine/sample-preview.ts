import { type SampleData, channelAt, frameCount } from '../sample'

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

  /** Adds the next `left.length` samples of the preview into the stereo buffers: each channel to its side, mono to both. */
  mixInto(left: Float32Array, right: Float32Array): void {
    const sample = this.sample
    if (!sample) return
    const speed = sample.sampleRate / this.sampleRate
    const length = frameCount(sample)

    for (let i = 0; i < left.length; i++) {
      const index = Math.floor(this.position)
      if (index >= length) {
        this.sample = null
        return
      }
      const fraction = this.position - index
      const a = channelAt(sample, 0, index)
      const b = channelAt(sample, 0, index + 1)
      const c = channelAt(sample, 1, index)
      const d = channelAt(sample, 1, index + 1)
      left[i] = (left[i] ?? 0) + (a + (b - a) * fraction) * this.level
      right[i] = (right[i] ?? 0) + (c + (d - c) * fraction) * this.level
      this.position += speed
    }
  }
}
