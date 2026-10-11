import type { Patch, PortRef } from './types'

/** The node type of a use of a module; every other type comes from the DSP registry. */
export const MODULE_NODE_TYPE = 'module'

/** A connection point on the outside of a module, wired to a port of one of its inner nodes. */
export interface ModulePort {
  /** Stable id; `exposedPortId` of the inner port it points at. */
  readonly id: string
  readonly label: string
  readonly inner: PortRef
}

/** A parameter of an inner node, shown as a knob on every use of the module. */
export interface ModuleKnob {
  /** Stable id; `exposedKnobId` of the inner parameter. */
  readonly id: string
  readonly label: string
  readonly node: string
  readonly param: string
}

/**
 * A reusable sub-patch with a chosen set of inputs, outputs and knobs. One definition, any number of uses
 * (`PatchNode` of type `module` with `moduleId`): editing the definition changes every use.
 */
export interface ModuleDefinition {
  readonly id: string
  readonly name: string
  readonly patch: Patch
  readonly inputs: readonly ModulePort[]
  readonly outputs: readonly ModulePort[]
  readonly knobs: readonly ModuleKnob[]
}

/** The modules available to a patch (the project's library). */
export type ModuleLibrary = readonly ModuleDefinition[]

export const exposedPortId = (ref: PortRef): string => `${ref.node}:${ref.port}`
export const exposedKnobId = (node: string, param: string): string => `${node}:${param}`
