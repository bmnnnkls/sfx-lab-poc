import { Params } from '../../params'
import { type DspNode, type NodeDefinition, type ParamSpec, type ProcessContext, DEFAULT_TEMPO, tempoOf } from '../../types'

/** Wide bounds for an operand: math nodes work on frequencies, notes, gains and times alike. */
const BOUND = 100000

export interface Operand {
  readonly id: string
  readonly label: string
  /** What the operand is while nothing is wired into it. */
  readonly default: number
}

/** What a rule may look at besides its operands: facts about the block being processed, updated before every block. */
export interface BlockInfo {
  /** The project's tempo in BPM (`DEFAULT_TEMPO` where the context has none). */
  tempo: number
}

/** The per-sample rule of a math node; it may keep state in its closure (one closure per node instance). */
export type MathFn = (a: number, b: number, c: number) => number

/**
 * A rule with settings: `block` runs once before every block and reads the parameters (and anything worked out from them,
 * such as a coefficient) into the closure, so `sample` does no lookups. Changes to a parameter take effect at the next block.
 */
export interface MathRule {
  readonly block: () => void
  readonly sample: MathFn
}

export interface MathSpec {
  readonly type: string
  readonly label: string
  /** Up to three. Each is an input port and also a parameter of the same id (its value while the port is unwired). */
  readonly operands: readonly Operand[]
  /** Parameters that are not operands (a range, a step, a curve). */
  readonly extra?: readonly ParamSpec[]
  /** `false`: the node has state over time (a clock, a counter), so it makes no sense as a constant in a note graph. */
  readonly inNotes?: false
  /**
   * `true`: the output depends only on the operands and the parameters, with no state. With nothing wired into it, the rule
   * then runs once per block instead of once per sample.
   */
  readonly pure?: true
  /**
   * Builds the rule for one instance; `params` is the node's own storage, and `block` says what the current block is like (the
   * tempo). A rule that reads parameters returns a `MathRule`, reading them in `block`; a bare function is a rule without settings.
   */
  readonly make: (params: Params, sampleRate: number, block: BlockInfo) => MathFn | MathRule
}

/**
 * An elementwise math node over buffers, so it works on constants, control signals and audio alike. An operand is the
 * buffer wired into its port, or, with nothing wired, its parameter (which can in turn be driven by its socket). The
 * result is never NaN or infinite.
 */
class MathNode implements DspNode {
  private readonly params: Params
  private readonly fn: MathFn
  private readonly prepare: (() => void) | undefined
  private readonly block: BlockInfo = { tempo: DEFAULT_TEMPO }
  /** The parameter behind each operand, or undefined where the node has fewer than three. */
  private readonly operandIds: readonly [string | undefined, string | undefined, string | undefined]

  constructor(
    private readonly spec: MathSpec,
    specs: readonly ParamSpec[],
    sampleRate: number,
  ) {
    this.params = new Params(specs)
    const rule = spec.make(this.params, sampleRate, this.block)
    this.fn = typeof rule === 'function' ? rule : rule.sample
    this.prepare = typeof rule === 'function' ? undefined : rule.block
    this.operandIds = [spec.operands[0]?.id, spec.operands[1]?.id, spec.operands[2]?.id]
  }

  setParam(id: string, value: number): void {
    this.params.set(id, value)
  }

  process(context: ProcessContext, inputs: ReadonlyArray<Float32Array | null>, [out]: readonly Float32Array[]): void {
    if (!out) return
    const { frames } = context
    this.block.tempo = tempoOf(context)
    this.prepare?.()
    const fn = this.fn
    const values = this.params.values
    const [idA, idB, idC] = this.operandIds
    const a = idA === undefined ? 0 : (values[idA] ?? 0)
    const b = idB === undefined ? 0 : (values[idB] ?? 0)
    const c = idC === undefined ? 0 : (values[idC] ?? 0)
    const inA = inputs[0] ?? null
    const inB = inputs[1] ?? null
    const inC = inputs[2] ?? null
    if (this.spec.pure === true && !inA && !inB && !inC) {
      // Nothing wired and no state: every sample of the block would be the same.
      const result = Math.fround(fn(a, b, c))
      out.fill(Number.isFinite(result) ? result : 0, 0, frames)
      return
    }
    for (let i = 0; i < frames; i++) {
      // Rounded to the buffer's precision first: a double that fits may still be Infinity once stored.
      const result = Math.fround(fn(inA ? (inA[i] ?? 0) : a, inB ? (inB[i] ?? 0) : b, inC ? (inC[i] ?? 0) : c))
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
    ...(spec.inNotes === false ? {} : { inNotes: true as const }),
    create: (sampleRate) => new MathNode(spec, params, sampleRate),
  }
}
