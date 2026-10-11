/** One-pole smoothing coefficient for a time constant in milliseconds: the step that closes 63% of a gap in that time. */
export const smoothingCoefficient = (milliseconds: number, sampleRate: number): number => {
  const samples = Math.max(0.0001, milliseconds) * 0.001 * sampleRate
  return 1 - Math.exp(-1 / samples)
}

export const FOLLOW_MODES = ['peak', 'rms'] as const

/**
 * How loud a signal is, moment by moment, as a number that moves slowly enough to be a control. `peak` follows the size of the
 * waves (it rises fast, with `attack`, and falls with `release`); `rms` follows their power, which is how loud it sounds, and reads
 * 0.707 of the peak for a sine. Never negative, never NaN.
 */
export class Follower {
  private state = 0

  /** One sample in, the level out. Attack applies while the signal is above the level, release while it is below. */
  next(sample: number, attack: number, release: number, rms: boolean): number {
    const input = Number.isFinite(sample) ? (rms ? sample * sample : Math.abs(sample)) : 0
    this.state += (input > this.state ? attack : release) * (input - this.state)
    return rms ? Math.sqrt(this.state) : this.state
  }

  reset(): void {
    this.state = 0
  }
}
