import type { ClockPosition, EngineStatus } from '@core'

interface Anchor { beat: number; audioTime: number; tempo: number; playing: boolean; floor: number; lap: number; run: number }
type ClockStatus = Pick<EngineStatus, 'tempo' | 'playing' | 'beat' | 'countIn' | 'run' | 'lap'>

/**
 * Sparse tempo/transport segments, in the AudioContext clock domain. A count-in is a running segment too, at its own
 * negative beats up to 0, so a note played in it has a beat (before the take's first one). Each segment keeps the
 * engine's run and loop pass, so a recorder can tell a loop jump's pass, and a seek, from a beat that went back.
 */
export class RecordingClock {
  private anchors: Anchor[] = []
  update(status: ClockStatus, audioTime: number): void {
    const counting = !status.playing && status.countIn !== undefined
    const beat = counting ? status.countIn!.beat : status.beat
    const anchor = { beat, audioTime, tempo: status.tempo ?? 120, playing: status.playing || counting, floor: counting ? beat : 0, lap: status.lap ?? 0, run: status.run ?? 0 }
    const previous = this.anchors.at(-1)
    const predicted = previous && previous.beat + (audioTime - previous.audioTime) * (previous.playing ? previous.tempo / 60 : 0)
    if (!previous || previous.playing !== anchor.playing || previous.tempo !== anchor.tempo || previous.lap !== anchor.lap || previous.run !== anchor.run || Math.abs(predicted! - anchor.beat) > 1e-7) {
      this.anchors.push(anchor)
      // More than sufficient for the bounded 256-beat take; cap malformed external status traffic.
      if (this.anchors.length > 4096) this.anchors.shift()
    }
  }
  beat(audioTime: number): number | undefined {
    return this.position(audioTime)?.beat
  }
  /** The beat at `audioTime`, with the run and the loop pass it fell in; undefined while stopped. */
  position(audioTime: number): ClockPosition | undefined {
    const anchor = [...this.anchors].reverse().find((a) => a.audioTime <= audioTime) ?? this.anchors[0]
    // A queued native event from an earlier transport run cannot acquire a new destination.
    if (anchor && this.anchors.slice(this.anchors.indexOf(anchor) + 1).some((a) => !a.playing)) return undefined
    if (!anchor?.playing) return undefined
    return { beat: Math.max(anchor.floor, anchor.beat + (audioTime - anchor.audioTime) * anchor.tempo / 60), lap: anchor.lap, run: anchor.run }
  }
}
