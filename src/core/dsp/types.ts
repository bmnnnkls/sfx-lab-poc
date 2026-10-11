/** Static description of a connection point on a node. */
export interface PortSpec {
  readonly id: string
  readonly label: string
  /** What travels through the port. Absent means an audio-rate `signal`. Only ports of the same kind connect. */
  readonly kind?: PortKind
  /**
   * A modulation input (a `cv`). When the node runs in stereo it stays one mono signal that both channels follow,
   * instead of becoming a left/right pair.
   */
  readonly control?: boolean
}

/**
 * `signal`: audio-rate buffers (the patcher). `stereo`: a left/right pair of them (see `stereo.ts`); a `signal`
 * output may feed a `stereo` input (it is heard in both channels), never the reverse. `notes`: streams of note events
 * (the note graph).
 */
export type PortKind = 'signal' | 'stereo' | 'notes'

import type { SampleLookup } from '../sample'

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
  /** How to show the value: `midiNote` renders 60 as "C4". */
  readonly format?: 'midiNote'
}

/** The note currently held by an instrument, shared with every node in its patch. */
export interface NoteState {
  frequency: number
  velocity: number
  gate: boolean
  /** Increments on every note start, so a note that steals a still-held voice can be seen as new. */
  trigger: number
}

export interface ProcessContext {
  /** Number of samples to render in this call (<= buffer length). */
  readonly frames: number
  readonly sampleRate: number
  readonly note: Readonly<NoteState>
  readonly samples: SampleLookup
  /** The signal a track's insert graph is processing; only `trackIn` reads it. Absent elsewhere (silence). */
  readonly input?: Float32Array
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
  /** Only for nodes with `usesSample`: choose which library sample to play. */
  setSample?(sampleId: string | null): void
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
  /**
   * Effects such as delay keep state that must outlive any single note, so they run once per
   * instrument on the sum of all voices instead of once per voice. Everything downstream of a
   * shared node is shared too.
   */
  readonly shared?: boolean
  /** Whatever is wired into this node's input is audible: the sum of all sinks is what the graph produces. */
  readonly sink?: boolean
  /** Only meaningful in a track's insert graph (the track's ends, stereo nodes); the instrument's palette leaves it out. */
  readonly insertOnly?: boolean
  /**
   * The node can run in stereo (`PatchNode.stereo`): the compiler then runs two copies of it, one per channel, with
   * the same parameters, and its signal ports become stereo (see `stereoPorts`).
   */
  readonly stereoCapable?: boolean
  /** The node plays library samples; the patcher shows a sample picker and stores `sampleId`. */
  readonly usesSample?: boolean
  create(sampleRate: number): DspNode
}
