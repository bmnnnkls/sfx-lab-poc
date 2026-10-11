/** A parameter of one node in the patch, as a control sees it. For a module use, `param` is one of the module's knobs. */
export interface ParamBinding {
  readonly node: string
  readonly param: string
}

export type ControlKind = 'knob' | 'slider' | 'xy' | 'selector'
export type ControlSize = 'S' | 'M' | 'L'

/**
 * One control on a patch's front panel. The panel is a view of the patch: the value lives in the node's parameter, the
 * control only says which one and how to draw it (range and unit are read from the node, never copied here).
 */
export interface PanelControl {
  readonly id: string
  readonly kind: ControlKind
  readonly label: string
  /** The parameter a knob, slider or selector sets; the X axis of an `xy` pad. */
  readonly bind: ParamBinding
  /** The Y axis of an `xy` pad, and only there. */
  readonly bindY?: ParamBinding
  readonly size: ControlSize
  /** Sliders only; absent means vertical. */
  readonly orientation?: 'vertical' | 'horizontal'
}

/** What `addControl` needs: the rest (id, size) is filled in. */
export interface ControlDraft {
  readonly kind: ControlKind
  readonly bind: ParamBinding
  readonly bindY?: ParamBinding
  readonly label?: string
  readonly size?: ControlSize
  readonly orientation?: 'vertical' | 'horizontal'
}

export const CONTROL_KINDS: readonly ControlKind[] = ['knob', 'slider', 'xy', 'selector']
export const CONTROL_SIZES: readonly ControlSize[] = ['S', 'M', 'L']
/** More than this is a layout nobody can use; it also bounds what a file can make us draw. */
export const MAX_PANEL_CONTROLS = 128
