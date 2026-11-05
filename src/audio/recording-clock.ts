import type { EngineStatus } from '@core'
interface Anchor { beat: number; audioTime: number; tempo: number; playing: boolean; floor: number }
/**
 * Sparse tempo/transport segments, in the AudioContext clock domain. A count-in is a running segment too, at its own
 * negative beats up to 0, so a note played in it has a beat (before the take's first one).
 */
export class RecordingClock {
  private anchors: Anchor[] = []
  update(status: Pick<EngineStatus, 'tempo' | 'playing' | 'beat' | 'countIn'>, audioTime: number): void {
    const counting = !status.playing && status.countIn !== undefined
    const beat = counting ? status.countIn!.beat : status.beat
    const anchor = { beat, audioTime, tempo: status.tempo ?? 120, playing: status.playing || counting, floor: counting ? beat : 0 }
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
    return anchor?.playing ? Math.max(anchor.floor, anchor.beat + (audioTime - anchor.audioTime) * anchor.tempo / 60) : undefined
  }
}
