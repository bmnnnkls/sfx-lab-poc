import { Params } from '../params'
import { hashSigned } from '../random'
import type { DspNode, NodeDefinition, ParamSpec, ProcessContext } from '../types'

const MAX_OCTAVES = 6

const PARAMS: readonly ParamSpec[] = [
  { id: 'rate', label: 'Rate', min: 0.01, max: 200, default: 1, unit: 'Hz' },
  { id: 'octaves', label: 'Octaves', min: 1, max: MAX_OCTAVES, default: 2, step: 1 },
  { id: 'persistence', label: 'Persistence', min: 0, max: 1, default: 0.5, step: 0.01 },
  { id: 'depth', label: 'Depth', min: 0, max: 1, default: 1, step: 0.01 },
  { id: 'seed', label: 'Seed', min: 0, max: 9999, default: 1, step: 1, socket: false },
]

/** Smooth ease between lattice points (Perlin's quintic), so the curve has no corners. */
const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10)

/**
 * One octave of 1D gradient noise at `x`: each whole number has a seeded slope, and the curve passes through zero there,
 * leaning along the slope, blending smoothly between them. Within about [-1, 1].
 */
export const gradientNoise = (x: number, seed: number): number => {
  const cell = Math.floor(x)
  const t = x - cell
  const left = hashSigned(cell, seed) * t
  const right = hashSigned(cell + 1, seed) * (t - 1)
  return 2 * (left + (right - left) * fade(t))
}

/** Octaves summed, each twice as fast and `persistence` times as strong as the one before; kept within [-1, 1]. */
export const fractalNoise = (x: number, seed: number, octaves: number, persistence: number): number => {
  let sum = 0
  let strength = 1
  let total = 0
  let speed = 1
  for (let octave = 0; octave < octaves; octave++) {
    // A different seed per octave, or each would repeat the shape of the one below it.
    sum += strength * gradientNoise(x * speed, seed + octave * 101)
    total += strength
    strength *= persistence
    speed *= 2
  }
  return total === 0 ? 0 : Math.max(-1, Math.min(1, sum / total))
}

/**
 * Smooth, organic wandering: Perlin noise as a signal. `out` swings both ways around zero, `uni` stays between 0 and
 * `depth`. Free-running, or restarted at the start of every note by a rise on the optional `Retrig` input, so each note
 * wanders the same way. Seeded: the same seed is the same wander.
 */
class Perlin implements DspNode {
  private readonly params = new Params(PARAMS)
  /** Position along the noise, in whole noise cells (one per 1/rate seconds). */
  private position = 0
  private previousGate = 0

  setParam(id: string, value: number): void {
    this.params.set(id, value)
  }

  process(
    { frames, sampleRate }: ProcessContext,
    [gate]: ReadonlyArray<Float32Array | null>,
    [out, uni]: readonly Float32Array[],
  ): void {
    const increment = this.params.get('rate') / sampleRate
    const octaves = Math.round(this.params.get('octaves'))
    const persistence = this.params.get('persistence')
    const depth = this.params.get('depth')
    const seed = this.params.get('seed')
    for (let i = 0; i < frames; i++) {
      if (gate) {
        const level = gate[i] ?? 0
        if (level > 0.5 && this.previousGate <= 0.5) this.position = 0
        this.previousGate = level
      }
      const value = fractalNoise(this.position, seed, octaves, persistence) * depth
      if (out) out[i] = value
      if (uni) uni[i] = (value + depth) / 2
      this.position += increment
    }
  }
}

export const perlinNode: NodeDefinition = {
  type: 'perlin',
  label: 'Perlin noise',
  inputs: [{ id: 'gate', label: 'Retrig' }],
  outputs: [
    { id: 'out', label: 'Out ±' },
    { id: 'uni', label: 'Out 0–1' },
  ],
  params: PARAMS,
  create: () => new Perlin(),
}
