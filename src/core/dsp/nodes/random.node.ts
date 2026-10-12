import { Params } from '../params'
import { createRng, voiceSeed, voicesDiffer, voicesParam } from '../random'
import type { DspNode, NodeDefinition, ParamSpec, ProcessContext } from '../types'

const BOUND = 100000

const PARAMS: readonly ParamSpec[] = [
  { id: 'min', label: 'Min', min: -BOUND, max: BOUND, default: 0 },
  { id: 'max', label: 'Max', min: -BOUND, max: BOUND, default: 1 },
  // Snap the roll to multiples of this (0: any value), counted from the lowest end.
  { id: 'step', label: 'Step', min: 0, max: BOUND, default: 0 },
  { id: 'seed', label: 'Seed', min: 0, max: 9999, default: 1, step: 1, socket: false },
  // Only means something where the node runs once per voice (a Roll wired from a note); a global Random is one copy.
  voicesParam(0),
]

/** A random value between `min` and `max` (either way round), on the step when there is one. Never NaN. */
export const rollBetween = (unit: number, min: number, max: number, step: number): number => {
  const [a, b] = [Number.isFinite(min) ? min : 0, Number.isFinite(max) ? max : 0]
  const low = Math.min(a, b)
  const high = Math.max(a, b)
  const raw = low + (Number.isFinite(unit) ? unit : 0) * (high - low)
  const snapped = step > 0 ? low + Math.round((raw - low) / step) * step : raw
  const result = Math.min(high, snapped)
  return Number.isFinite(result) ? result : low
}

/**
 * A random value that stays until it is asked for another: each rise of `Roll` through 0.5 draws a new one between Min and
 * Max. Wire a push button (a Switch in trigger mode), a clock, a note's gate or an LFO into `Roll`. It starts with a value
 * already drawn, from its seed, so the same seed gives the same first value and the same sequence of rolls.
 */
class RandomValue implements DspNode {
  private readonly params = new Params(PARAMS)
  private readonly rng = createRng(1)
  /** The roll as a position between Min and Max (0 to 1), so turning Min, Max or Step moves the value without a new roll. */
  private held: number
  private started = false
  private high = false

  constructor(private readonly salt: number) {
    this.held = this.rng.next()
  }

  setParam(id: string, value: number): void {
    this.params.set(id, value)
    if (id === 'seed' || id === 'voices') this.started = false
  }

  process({ frames }: ProcessContext, [roll]: ReadonlyArray<Float32Array | null>, [out]: readonly Float32Array[]): void {
    if (!out) return
    // The first value is drawn from the seed the node really has (the constructor only knew the default), and again after a new seed.
    if (!this.started) {
      this.rng.reseed(voiceSeed(this.params.get('seed'), this.salt, voicesDiffer(this.params.get('voices'))))
      this.held = this.rng.next()
      this.started = true
    }
    const [min, max, step] = [this.params.get('min'), this.params.get('max'), this.params.get('step')]
    for (let i = 0; i < frames; i++) {
      const now = (roll?.[i] ?? 0) > 0.5
      if (now && !this.high) this.held = this.rng.next()
      this.high = now
      out[i] = rollBetween(this.held, min, max, step)
    }
  }
}

export const randomNode: NodeDefinition = {
  type: 'random',
  label: 'Random',
  inputs: [{ id: 'roll', label: 'Roll' }],
  outputs: [{ id: 'out', label: 'Out', kind: 'control' }],
  params: PARAMS,
  global: true,
  create: (_sampleRate, salt = 0) => new RandomValue(salt),
}
