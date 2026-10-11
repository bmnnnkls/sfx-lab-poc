import { RIGHT, type SendSink } from '../dsp'

const NO_SENDS_BLOCKED: ReadonlySet<string> = new Set()

/**
 * The send path of one track, with the mute/solo decision applied: hands sound to the engine's board except for the
 * return tracks the engine has blocked. Send nodes inside the track's insert graph and its send knobs both go through it.
 */
class SendGate implements SendSink {
  private board: SendSink | null = null
  /** Return tracks that get nothing from this track right now (it is muted, or soloed out). */
  blocked: ReadonlySet<string> = NO_SENDS_BLOCKED

  open(board: SendSink): this {
    this.board = board
    return this
  }

  add(trackId: string, source: Float32Array, amount: number, frames: number): void {
    if (!this.blocked.has(trackId)) this.board?.add(trackId, source, amount, frames)
  }
}

/**
 * A track's place in the mix, after its insert graph: fader, pan, mute/solo and the level meter. The same for every
 * kind of track, so each runtime just hands its stereo signal to `mixInto`.
 */
export class ChannelStrip {
  /** 0..1 */
  volume: number
  /** -1..1 */
  pan = 0
  muted = false
  soloed = false
  /** Whether the track is heard in the output. Decided by the engine from every track's mute and solo, not here. */
  audible = true
  private readonly gate = new SendGate()
  private peak = 0

  constructor(volume: number) {
    this.volume = volume
  }

  /** Return tracks this one must not send to (the engine updates it when a mute or solo changes). */
  set blockedSends(ids: ReadonlySet<string>) {
    this.gate.blocked = ids
  }

  /** Where the track's Send nodes and send knobs deliver to: the engine's board behind this track's mute/solo gate. */
  sendsTo(board: SendSink): SendSink {
    return this.gate.open(board)
  }

  /**
   * Adds the stereo `signal` (left at `[i]`, right at `[RIGHT + i]`) to the buses, scaled by the fader and panned with a
   * constant-power law: the same cos/sin curve as the Pan node, scaled by sqrt(2) so the centre passes at unity. A track
   * that is not audible adds nothing (and its meter reads zero), but the caller has already run its effects.
   */
  mixInto(left: Float32Array, right: Float32Array, offset: number, frames: number, signal: Float32Array): void {
    if (!this.audible) return
    const angle = ((this.pan + 1) * Math.PI) / 4
    // pan 0 is exactly 1/1, so a project that never touches pan sounds as it did before there was one.
    const leftGain = this.volume * (this.pan === 0 ? 1 : Math.SQRT2 * Math.cos(angle))
    const rightGain = this.volume * (this.pan === 0 ? 1 : Math.SQRT2 * Math.sin(angle))
    let peak = this.peak
    for (let i = 0; i < frames; i++) {
      const l = (signal[i] ?? 0) * leftGain
      const r = (signal[RIGHT + i] ?? 0) * rightGain
      left[offset + i] = (left[offset + i] ?? 0) + l
      right[offset + i] = (right[offset + i] ?? 0) + r
      peak = Math.max(peak, Math.abs(l), Math.abs(r))
    }
    this.peak = peak
  }

  /** The loudest sample this track added to the output since the previous call. */
  takePeak(): number {
    const peak = this.peak
    this.peak = 0
    return peak
  }
}
