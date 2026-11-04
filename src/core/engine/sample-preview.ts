import { type SampleData, channelAt, frameCount } from '../sample'
import type { PreviewStatus } from './status'

/** What part of a sample a preview plays: frames `from` up to `to`, once or looping. The whole sample by default. */
export interface PreviewRange {
  readonly from?: number
  readonly to?: number
  readonly loop?: boolean
}

/** Plays one sample straight to the master output so a user can audition it. Not part of any track. */
export class SamplePreview {
  private sample: SampleData | null = null
  private read = 0
  private from = 0
  private to = 0
  private loop = false

  constructor(
    private readonly sampleRate: number,
    private readonly level = 0.8,
  ) {}

  start(sample: SampleData, { from = 0, to, loop = false }: PreviewRange = {}): void {
    const length = frameCount(sample)
    const start = Math.max(0, Math.min(length, Math.floor(from)))
    const end = Math.max(start, Math.min(length, Math.floor(to ?? length)))
    this.sample = end > start ? sample : null
    this.from = start
    this.to = end
    this.loop = loop
    this.read = start
  }

  stop(): void {
    this.sample = null
  }

  /** The sample playing and the frame it has reached, or null when nothing is. */
  position(): PreviewStatus | null {
    return this.sample ? { sampleId: this.sample.id, frame: Math.floor(this.read) } : null
  }

  /** Adds the next `left.length` samples of the preview into the stereo buffers: each channel to its side, mono to both. */
  mixInto(left: Float32Array, right: Float32Array): void {
    const sample = this.sample
    if (!sample) return
    const speed = sample.sampleRate / this.sampleRate
    const { from, to, loop } = this

    for (let i = 0; i < left.length; i++) {
      if (this.read >= to) {
        if (!loop) {
          this.sample = null
          return
        }
        this.read = from + ((this.read - to) % (to - from))
      }
      const index = Math.floor(this.read)
      const fraction = this.read - index
      // A loop's last frame leads back into its first, so the seam is continuous.
      const next = loop && index + 1 >= to ? from : index + 1
      const a = channelAt(sample, 0, index)
      const b = channelAt(sample, 0, next)
      const c = channelAt(sample, 1, index)
      const d = channelAt(sample, 1, next)
      left[i] = (left[i] ?? 0) + (a + (b - a) * fraction) * this.level
      right[i] = (right[i] ?? 0) + (c + (d - c) * fraction) * this.level
      this.read += speed
    }
  }
}
