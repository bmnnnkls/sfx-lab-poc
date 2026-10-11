import type { PanelControl } from './panel-types'

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
  /** The front panel: controls bound to this patch's parameters, in order. Absent until one is made. A view only: the engine never sees it. */
  readonly panel?: readonly PanelControl[]
}
