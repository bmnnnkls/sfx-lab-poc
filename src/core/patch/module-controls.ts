import { findNodeDefinition } from '../dsp'
import type { ModuleDefinition } from './module-types'
import type { PatchNode } from './types'

/** The parameters of each kind of control that carry its value: what a use of the module stores, and what the parent's panel moves. */
const VALUE_PARAMS = { value: ['value'], xy: ['x', 'y'], switch: ['on'] } as const

/** The key under which a use stores one value of an inner control: the same scheme as a module knob (`<inner node>:<param>`). */
export const controlParamKey = (innerId: string, param: string): string => `${innerId}:${param}`

/** An inner control a use of the module offers on the panel of the graph that holds it. */
export interface ModuleControl {
  readonly node: PatchNode
  /** The parameters that carry its value (`value`; `x` and `y`; `on`). */
  readonly params: readonly string[]
}

/**
 * The control nodes directly inside a module that are shown on the panel (`panel.show` is not false). Each use of the module
 * keeps its own values for them, so the same module can be a bright voice here and a dark one there; the definition's value is
 * the default until a use is turned. Controls in a module nested inside this one are not offered here: open that one.
 */
export const moduleControls = (definition: ModuleDefinition): readonly ModuleControl[] =>
  definition.patch.nodes.flatMap((node) => {
    const kind = findNodeDefinition(node.type)?.panelKind
    return kind === undefined || node.panel?.show === false ? [] : [{ node, params: VALUE_PARAMS[kind] }]
  })
