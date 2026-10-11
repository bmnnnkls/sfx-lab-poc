import { Params } from '../params'
import type { DspNode, NodeDefinition, ParamSpec, ProcessContext } from '../types'

const SHAPES = ['sine', 'triangle', 'saw', 'square', 'random'] as const

const PARAMS: readonly ParamSpec[] = [
  { id: 'shape', label: 'Shape', min: 0, max: SHAPES.length - 1, default: 0, step: 1, options: SHAPES },
  { id: 'rate', label: 'Rate', min: 0.05, max: 30, default: 2, step: 0.01, unit: 'Hz' },
  { id: 'depth', label: 'Depth', min: 0, max: 1, default: 1, step: 0.01 },
]

/** Small deterministic generator, so sample-and-hold sequences are reproducible. */
const nextRandom = (state: number): number => (Math.imul(state, 1664525) + 1013904223) >>> 0

const toBipolar = (state: number): number => (state / 0x100000000) * 2 - 1

/**
 * Low-frequency oscillator for modulating other nodes. `out` swings both ways around zero (for pitch,
 * vibrato), `uni` stays between 0 and `depth` (for gain or cutoff). A rising edge on the optional
 * `gate` input restarts the cycle, so every note gets the same modulation; unconnected, it free-runs.
 */
class Lfo implements DspNode {
  private readonly params = new Params(PARAMS)
  private phase = 0
  private seed = 0x9e3779b9
  private held = 0
  private previousGate = 0

  constructor() {
    this.draw()
  }

  setParam(id: string, value: number): void {
    this.params.set(id, value)
  }

  private draw(): void {
    this.seed = nextRandom(this.seed)
    this.held = toBipolar(this.seed)
  }

  private valueAt(shape: number): number {
    switch (SHAPES[shape]) {
      case 'triangle':
        return 4 * Math.abs(this.phase - 0.5) - 1
      case 'saw':
        return 2 * this.phase - 1
      case 'square':
        return this.phase < 0.5 ? 1 : -1
      case 'random':
        return this.held
      default:
        return Math.sin(2 * Math.PI * this.phase)
    }
  }

  process(
    { frames, sampleRate }: ProcessContext,
    [gate]: ReadonlyArray<Float32Array | null>,
    [out, uni]: readonly Float32Array[],
  ): void {
    const shape = Math.round(this.params.get('shape'))
    const increment = this.params.get('rate') / sampleRate
    const depth = this.params.get('depth')

    for (let i = 0; i < frames; i++) {
      if (gate) {
        const level = gate[i] ?? 0
        if (level > 0.5 && this.previousGate <= 0.5) {
          this.phase = 0
          this.draw()
        }
        this.previousGate = level
      }

      const value = this.valueAt(shape) * depth
      if (out) out[i] = value
      if (uni) uni[i] = (value + depth) / 2

      this.phase += increment
      if (this.phase >= 1) {
        this.phase -= Math.floor(this.phase)
        this.draw()
      }
    }
  }
}

export const lfoNode: NodeDefinition = {
  type: 'lfo',
  label: 'LFO',
  inputs: [{ id: 'gate', label: 'Retrig' }],
  outputs: [
    { id: 'out', label: 'Out ±' },
    { id: 'uni', label: 'Out 0–1' },
  ],
  params: PARAMS,
  create: () => new Lfo(),
}
