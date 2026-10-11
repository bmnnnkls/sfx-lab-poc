/** Static description of a connection point on a node. */
export interface PortSpec {
  readonly id: string
  readonly label: string
  /** One plain sentence: what the port is for. Shown in the tooltip. */
  readonly description?: string
  /** On a parameter socket: the parameter's range, default and unit, so a knob can be made from the socket. */
  readonly range?: { readonly min: number; readonly max: number; readonly default: number; readonly unit?: string }
  /** What travels through the port. Absent means an audio-rate `signal`. Only ports of the same kind connect. */
  readonly kind?: PortKind
  /**
   * A modulation input (a `cv`). When the node runs in stereo it stays one mono signal that both channels follow,
   * instead of becoming a left/right pair.
   */
  readonly control?: boolean
  /**
   * Set on the sockets `describeNode` generates for a numeric parameter (`param-sockets.ts`): the id of the parameter
   * this port drives. Such a port is not an input of the DSP node; it is read once per block and applied with `setParam`.
   */
  readonly param?: string
}

/**
 * `signal`: audio-rate buffers (the patcher). `stereo`: a left/right pair of them (see `stereo.ts`); a `signal`
 * output may feed a `stereo` input (it is heard in both channels), never the reverse. `notes`: streams of note events
 * (the note graph). `control`: a value that changes slowly (a knob, a parameter socket); it is still a buffer, constant
 * over a block, so it may feed a `signal` input, and a `signal` may feed a `control` socket (it is read once per block).
 * Not to be confused with `PortSpec.control`, which marks a modulation input that stays mono in a stereo node.
 */
export type PortKind = 'signal' | 'stereo' | 'notes' | 'control'

import type { SampleLookup } from '../sample'

/** Static description of a user-editable node parameter. */
export interface ParamSpec {
  readonly id: string
  readonly label: string
  /** One plain sentence: what the parameter does. Shown in the tooltip. */
  readonly description?: string
  readonly min: number
  readonly max: number
  readonly default: number
  readonly step?: number
  readonly unit?: string
  /** When present the parameter is an enum; its value is an index into this list. */
  readonly options?: readonly string[]
  /** How to show the value: `midiNote` renders 60 as "C4". */
  readonly format?: 'midiNote'
  /**
   * The range of this parameter is not fixed: it is whatever the node's own parameters `min` and `max` say (a control
   * node's value lies between its min and max). `min` / `max` here are then only wide bounds; `liveSpec` resolves it.
   */
  readonly range?: { readonly min: string; readonly max: string; readonly step?: string; readonly curve?: string; readonly reset?: string }
  /** The unit is the node's own text (`PatchNode.unit` / `unitY`), not a fixed one: a control's unit is whatever the user says. */
  readonly unitFrom?: 'unit' | 'unitY'
  /** How a knob or slider maps its position onto the range. Absent: logarithmic for wide positive ranges, else linear (`liveSpec` sets it from a control's own `curve`). */
  readonly curve?: 'linear' | 'log' | 'exp'
}

/** The note currently held by an instrument, shared with every node in its patch. */
export interface NoteState {
  frequency: number
  velocity: number
  gate: boolean
  /** Increments on every note start, so a note that steals a still-held voice can be seen as new. */
  trigger: number
}

/** Where a Send node puts its signal: the engine adds it, scaled, to the input of the return track `trackId`. */
export interface SendSink {
  /** `source` is a mono or a stereo buffer; a mono one is added to both channels. */
  add(trackId: string, source: Float32Array, amount: number, frames: number): void
}

/** Where a Track audio node reads another track's sound: what the track produced in the stretch being mixed. */
export interface SignalTaps {
  /** `tap` 0 is the track's own sound before its effects, 1 after them (both before its fader). A stereo buffer, or undefined. */
  read(trackId: string, tap: number): Float32Array | undefined
}

export interface ProcessContext {
  /** Number of samples to render in this call (<= buffer length). */
  readonly frames: number
  readonly sampleRate: number
  readonly note: Readonly<NoteState>
  readonly samples: SampleLookup
  /**
   * The signal a track's insert graph is processing: mono for an instrument or audio track (read by `trackIn`),
   * stereo for a return track (read by `returnIn`). Absent elsewhere (silence).
   */
  readonly input?: Float32Array
  /** Where Send nodes put their signal. Absent where there is nowhere to send to (an instrument's own patch). */
  readonly sends?: SendSink
  /** Where Track audio nodes read other tracks. Absent where that makes no sense (the master graph). */
  readonly taps?: SignalTaps
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
  /** Only for nodes with `usesTrack`: choose which track the node refers to. */
  setTrack?(trackId: string | null): void
  process(
    context: ProcessContext,
    inputs: ReadonlyArray<Float32Array | null>,
    outputs: readonly Float32Array[],
  ): void
}

/** How the node picker groups nodes. A module is placed under `Modules`, which the picker adds. */
export const NODE_CATEGORIES = ['Sources', 'Controls', 'Modulation', 'Math', 'Filters', 'Effects', 'Routing'] as const
export type NodeCategory = (typeof NODE_CATEGORIES)[number]

/** Everything the app needs to know about a node type: its shape and how to build it. */
export interface NodeDefinition {
  readonly type: string
  readonly label: string
  /** One plain sentence: what the node does. Shown in the picker and the tooltip. */
  readonly description?: string
  readonly category?: NodeCategory
  /** Extra words the picker's search matches (other names for the same thing). */
  readonly keywords?: readonly string[]
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
  /** The node refers to a track: a Send picks one of the return tracks, Track audio any other track. */
  readonly usesTrack?: 'return' | 'audio'
  /** The node plays library samples; the patcher shows a sample picker and stores `sampleId`. */
  readonly usesSample?: boolean
  /**
   * The node may run in the `global` stage: once per block per instrument, not once per voice (see `planStages`). It
   * does when everything wired into it is global too; a node with no inputs (a control) always is.
   */
  readonly global?: boolean
  /**
   * The node is itself a control that can sit on a panel: `value` (one knob or slider), `xy` (a pad) or `switch`.
   * Its parameters are settings (range, step), not knobs.
   */
  readonly panelKind?: 'value' | 'xy' | 'switch'
  /**
   * The node may also sit in a note graph (controls and math nodes): there it works out constants that drive the note nodes'
   * parameters, and has no sound of its own.
   */
  readonly inNotes?: true
  /** `false`: the node's numeric parameters get no sockets (a control's own range and step are settings, not signals). */
  readonly paramSockets?: false
  create(sampleRate: number): DspNode
}
