import type { MixContext } from './playable-track'
import { StereoBus } from './stereo-bus'

/** Live counterpart of a return track: no clips, only the effects it applies to what the other tracks sent it. */
export class ReturnTrackRuntime extends StereoBus {
  /** A return has no send knobs, only Send nodes. */
  setSends(): void {}

  protected input(mix: MixContext): Float32Array | undefined {
    return mix.sends.read(this.trackId)
  }

  mixInto(left: Float32Array, right: Float32Array, offset: number, frames: number, mix: MixContext): void {
    this.strip.mixInto(left, right, offset, frames, this.process(frames, mix))
  }
}
