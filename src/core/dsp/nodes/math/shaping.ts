import type { ParamSpec } from '../../types'
import { CURVE_OPTIONS } from '../control-value'
import { mathNode } from './math-node'

const BOUND = 100000
const range = (id: string, label: string, initial: number): ParamSpec => ({ id, label, min: -BOUND, max: BOUND, default: initial })

/** How far the `exp` curve bends: 0 is straight, larger starts slower and ends faster. */
const BEND = 3

/** A 0..1 position bent by a curve; `log` is handled by the caller (it needs the output range). */
const bent = (t: number, curve: number): number => (curve === 2 ? (Math.exp(BEND * t) - 1) / (Math.exp(BEND) - 1) : t)

export const mapRangeNode = mathNode({
  type: 'mapRange',
  label: 'Map range',
  pure: true,
  operands: [{ id: 'in', label: 'In', default: 0 }],
  extra: [
    range('inMin', 'In min', 0),
    range('inMax', 'In max', 1),
    range('outMin', 'Out min', 0),
    range('outMax', 'Out max', 1),
    { id: 'curve', label: 'Curve', min: 0, max: CURVE_OPTIONS.length - 1, default: 0, step: 1, options: CURVE_OPTIONS },
  ],
  make: (params) => {
    let inMin = 0
    let span = 1
    let outMin = 0
    let outMax = 1
    let curve = 0
    return {
      block: () => {
        inMin = params.get('inMin')
        span = params.get('inMax') - inMin
        outMin = params.get('outMin')
        outMax = params.get('outMax')
        curve = Math.round(params.get('curve'))
      },
      sample: (a) => {
        const t = span === 0 ? 0 : Math.min(1, Math.max(0, (a - inMin) / span))
        // `log` is equal ratios per step (a cutoff sweep), which only exists between two positive numbers; otherwise straight.
        if (curve === 1 && outMin > 0 && outMax > 0) return outMin * (outMax / outMin) ** t
        return outMin + (outMax - outMin) * bent(t, curve)
      },
    }
  },
})

export const quantizeNode = mathNode({
  type: 'quantize',
  label: 'Quantize',
  pure: true,
  operands: [{ id: 'in', label: 'In', default: 0 }],
  extra: [
    { id: 'step', label: 'Step', min: 0, max: BOUND, default: 1 },
    range('offset', 'Offset', 0),
  ],
  // A step of 0 means no steps: the signal passes.
  make: (params) => {
    let step = 1
    let offset = 0
    return {
      block: () => {
        step = params.get('step')
        offset = params.get('offset')
      },
      sample: (a) => (step > 0 ? offset + Math.round((a - offset) / step) * step : a),
    }
  },
})

export const mixNode = mathNode({
  type: 'mix',
  label: 'Mix',
  pure: true,
  operands: [
    { id: 'a', label: 'A', default: 0 },
    { id: 'b', label: 'B', default: 1 },
    { id: 't', label: 'Mix', default: 0.5 },
  ],
  make: () => (a, b, t) => {
    const amount = Math.min(1, Math.max(0, t))
    return a * (1 - amount) + b * amount
  },
})
