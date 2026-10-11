/** The groove tools' last-used amounts. Remembered between sessions. */
export interface GrooveSettings {
  /** Quantize: 0..1, how far notes move towards the grid. */
  readonly strength: number
  /** Quantize: also snap note ends. */
  readonly ends: boolean
  /** Swing: 50..75, where the off-beat lands within each pair of grid steps. */
  readonly swing: number
  /** Humanize: 0..1 timing wobble. */
  readonly humanizeTiming: number
  /** Humanize: 0..1 velocity wobble. */
  readonly humanizeVelocity: number
}

export const DEFAULT_GROOVE: GrooveSettings = {
  strength: 1,
  ends: false,
  swing: 62,
  humanizeTiming: 0.3,
  humanizeVelocity: 0.3,
}

const inRange = (value: unknown, min: number, max: number): boolean =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max

export const isGrooveSettings = (value: unknown): value is GrooveSettings => {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    inRange(v.strength, 0, 1) &&
    typeof v.ends === 'boolean' &&
    inRange(v.swing, 50, 75) &&
    inRange(v.humanizeTiming, 0, 1) &&
    inRange(v.humanizeVelocity, 0, 1)
  )
}
