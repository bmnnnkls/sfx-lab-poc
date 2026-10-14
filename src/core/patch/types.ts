/** How big a control is on the panel: knobs and sliders grow with it, a pad is 2x2, 3x2 or 3x3 cells. */
export const CONTROL_SIZES = ['S', 'M', 'L'] as const
export type ControlSize = (typeof CONTROL_SIZES)[number]

/**
 * Where a control node sits on the front panel. Absent: on the panel, its kind's default size, after the controls that
 * have an `order`, in patch order. Only what differs from that is stored.
 */
export interface NodePanel {
  /** `false` keeps the control off the panel (it still works in the graph). */
  readonly show?: false
  readonly size?: ControlSize
  /** Position among the panel's controls; a reorder numbers all of them. */
  readonly order?: number
}

/** A MIDI controller (CC) that moves a control node: its number, and the channel it must come on (absent: any channel). */
export interface MidiBinding {
  readonly cc: number
  readonly channel?: number
}

/** How a control node is drawn on the panel. */
export const CONTROL_DISPLAYS = ['knob', 'slider', 'slider-horizontal'] as const
export type ControlDisplay = (typeof CONTROL_DISPLAYS)[number]

export interface PortRef {
  readonly node: string
  readonly port: string
}

export interface PatchNode {
  readonly id: string
  /** Key into the DSP node registry. */
  readonly type: string
  /** Canvas position, owned by the patcher UI but stored with the document. */
  readonly x: number
  readonly y: number
  readonly params: Readonly<Record<string, number>>
  /** For control nodes: the unit shown with the value ("Hz", "%"); for an XY pad, of its x axis. */
  readonly unit?: string
  /** For an XY pad: the unit of its y axis. */
  readonly unitY?: string
  /** For a *Control* node: how the panel draws it. Absent: a knob. */
  readonly display?: ControlDisplay
  /** For control nodes: where it sits on the front panel. */
  readonly panel?: NodePanel
  /** For knobs, sliders, switches and selectors: the MIDI controller that moves it (learned on the panel). */
  readonly midi?: MidiBinding
  /** What the user calls this node. Absent: the node's type label, numbered when alike ("Oscillator 2"). */
  readonly name?: string
  /** For sample-playing nodes: id of the project sample to play. */
  readonly sampleId?: string
  /** For `trackNotes` nodes: which track the notes are taken from. For `send` nodes: which return track they send to. */
  readonly trackId?: string
  /**
   * For nodes that can run in stereo (filter, gain, delay): two copies of the node, one per channel, with the same
   * settings. Its signal ports are then stereo ports (see `describeNode`).
   */
  readonly stereo?: boolean
  /** For note effects: notes pass through untouched while this is true. */
  readonly bypassed?: boolean
  /** The node keeps its settings when the patch is randomized or mutated (`randomizeParams`). Absent: it does not. */
  readonly locked?: true
  /** For `module` nodes: which module definition this is a use of. `params` then holds the exposed knobs. */
  readonly moduleId?: string
}

export interface PatchConnection {
  readonly id: string
  readonly from: PortRef
  readonly to: PortRef
}

/** A node graph describing one instrument. Immutable; edit via `patch/edit`. */
export interface Patch {
  readonly nodes: readonly PatchNode[]
  readonly connections: readonly PatchConnection[]
}
