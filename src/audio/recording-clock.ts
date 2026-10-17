import type { EngineStatus } from '@core'
interface Anchor { beat: number; audioTime: number; tempo: number; playing: boolean }
/** Sparse tempo/transport segments, in the AudioContext clock domain. */
export class RecordingClock {
  private anchors: Anchor[] = []
  update(status: EngineStatus, audioTime: number): void {
    const anchor = { beat: status.beat, audioTime, tempo: status.tempo ?? 120, playing: status.playing }
    const previous = this.anchors.at(-1)
    const predicted = previous && previous.beat + (audioTime - previous.audioTime) * (previous.playing ? previous.tempo / 60 : 0)
    if (!previous || previous.playing !== anchor.playing || previous.tempo !== anchor.tempo || Math.abs(predicted! - anchor.beat) > 1e-7) {
      this.anchors.push(anchor)
      // More than sufficient for the bounded 256-beat take; cap malformed external status traffic.
      if (this.anchors.length > 4096) this.anchors.shift()
    }
  }
  beat(audioTime: number): number | undefined {
    const anchor = [...this.anchors].reverse().find((a) => a.audioTime <= audioTime) ?? this.anchors[0]
    // A queued native event from an earlier transport run cannot acquire a new destination.
    if (anchor && this.anchors.slice(this.anchors.indexOf(anchor) + 1).some((a) => !a.playing)) return undefined
    return anchor?.playing ? Math.max(0, anchor.beat + (audioTime - anchor.audioTime) * anchor.tempo / 60) : undefined
  }
}
