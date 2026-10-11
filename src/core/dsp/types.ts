/** Static description of a connection point on a node. */
export interface PortSpec {
  readonly id: string
  readonly label: string
}

/** Static description of a user-editable node parameter. */
export interface ParamSpec {
  readonly id: string
  readonly label: string
  readonly min: number
  readonly max: number
  readonly default: number
  readonly step?: number
  readonly unit?: string
  /** When present the parameter is an enum; its value is an index into this list. */
  readonly options?: readonly string[]
}

/** The note currently held by an instrument, shared with every node in its patch. */
export interface NoteState {
  frequency: number
  velocity: number
  gate: boolean
}

export interface ProcessContext {
  /** Number of samples to render in this call (<= buffer length). */
  readonly frames: number
  readonly sampleRate: number
  readonly note: Readonly<NoteState>
}

/**
 * A single signal processor. Every signal is audio-rate, so control signals
 * (gate, frequency, envelopes) are just buffers like any other.
 *
 * `inputs[i]` matches `NodeDefinition.inputs[i]` and is `null` when unconnected.
 * `outputs[i]` matches `NodeDefinition.outputs[i]` and must be fully written.
 */
export interface DspNode {
  setParam(id: string, value: number): void
  process(
    context: ProcessContext,
    inputs: ReadonlyArray<Float32Array | null>,
    outputs: readonly Float32Array[],
  ): void
}

/** Everything the app needs to know about a node type: its shape and how to build it. */
export interface NodeDefinition {
  readonly type: string
  readonly label: string
  readonly inputs: readonly PortSpec[]
  readonly outputs: readonly PortSpec[]
  readonly params: readonly ParamSpec[]
  create(sampleRate: number): DspNode
}
