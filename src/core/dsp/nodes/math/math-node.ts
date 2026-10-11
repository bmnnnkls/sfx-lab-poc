import { Params } from '../../params'
import type { DspNode, NodeDefinition, ParamSpec, ProcessContext } from '../../types'

/** Wide bounds for an operand: math nodes work on frequencies, notes, gains and times alike. */
const BOUND = 100000

export interface Operand {
  readonly id: string
  readonly label: string
  /** What the operand is while nothing is wired into it. */
  readonly default: number
}

/** The per-sample rule of a math node; it may keep state in its closure (one closure per node instance). */
export type MathFn = (a: number, b: number, c: number) => number

export interface MathSpec {
  readonly type: string
  readonly label: string
  /** Up to three. Each is an input port and also a parameter of the same id (its value while the port is unwired). */
  readonly operands: readonly Operand[]
  /** Parameters that are not operands (a range, a step, a curve). */
  readonly extra?: readonly ParamSpec[]
  /** Builds the rule for one instance; `params` is the node's own storage, read when the rule runs. */
  readonly make: (params: Params, sampleRate: number) => MathFn
}

/**
 * An elementwise math node over buffers, so it works on constants, control signals and audio alike. An operand is the
 * buffer wired into its port, or, with nothing wired, its parameter (which can in turn be driven by its socket). The
 * result is never NaN or infinite.
 */
class MathNode implements DspNode {
  private readonly params: Params
  private readonly fn: MathFn

  constructor(
    private readonly spec: MathSpec,
    specs: readonly ParamSpec[],
    sampleRate: number,
  ) {
    this.params = new Params(specs)
    this.fn = spec.make(this.params, sampleRate)
  }

  setParam(id: string, value: number): void {
    this.params.set(id, value)
  }

  process({ frames }: ProcessContext, inputs: ReadonlyArray<Float32Array | null>, [out]: readonly Float32Array[]): void {
    if (!out) return
    const operands = this.spec.operands
    const [a, b, c] = [0, 1, 2].map((index) => {
      const operand = operands[index]
      return operand ? this.params.get(operand.id) : 0
    }) as [number, number, number]
    const [inA, inB, inC] = [inputs[0] ?? null, inputs[1] ?? null, inputs[2] ?? null]
    for (let i = 0; i < frames; i++) {
      // Rounded to the buffer's precision first: a double that fits may still be Infinity once stored.
      const result = Math.fround(this.fn(inA ? (inA[i] ?? 0) : a, inB ? (inB[i] ?? 0) : b, inC ? (inC[i] ?? 0) : c))
      out[i] = Number.isFinite(result) ? result : 0
    }
  }
}

export const mathNode = (spec: MathSpec): NodeDefinition => {
  const params: ParamSpec[] = [
    ...spec.operands.map((operand) => ({
      id: operand.id,
      label: operand.label,
      min: -BOUND,
      max: BOUND,
      default: operand.default,
    })),
    ...(spec.extra ?? []),
  ]
  return {
    type: spec.type,
    label: spec.label,
    inputs: spec.operands.map(({ id, label }) => ({ id, label })),
    outputs: [{ id: 'out', label: 'Out' }],
    params,
    global: true,
    create: (sampleRate) => new MathNode(spec, params, sampleRate),
  }
}
