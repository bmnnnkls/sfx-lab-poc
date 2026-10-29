import type { SendLevels } from '../project'
import type { MixContext } from './playable-track'
import { StereoBus } from './stereo-bus'

/**
 * Live counterpart of a group's bus, keyed by the group's id: its members' sound after their faders, summed on the
 * engine's `outputs` board, through its effects and its strip, with post-fader send knobs as a track has.
 */
export class GroupBusRuntime extends StereoBus {
  private sendList: (readonly [string, number])[] = []

  setSends(sends: SendLevels): void {
    this.sendList = Object.entries(sends)
  }

  sendTargets(): string[] {
    return [...new Set([...this.targets, ...this.sendList.map(([id]) => id)])]
  }

  protected input(mix: MixContext): Float32Array | undefined {
    return mix.outputs.read(this.trackId)
  }

  mixInto(left: Float32Array, right: Float32Array, offset: number, frames: number, mix: MixContext): void {
    const signal = this.process(frames, mix)
    this.strip.mixInto(left, right, offset, frames, signal)
    const sends = this.strip.sendsTo(mix.sends)
    for (const [returnId, level] of this.sendList) this.strip.send(sends, returnId, signal, level, frames)
  }
}
