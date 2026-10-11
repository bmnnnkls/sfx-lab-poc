import type { ModuleLibrary } from './module-types'
import { describeNode } from './node-shape'
import type { ControlSize, Patch, PatchNode } from './types'

/**
 * The front panel is the patch's control nodes: a knob on the board IS a Control node, so it has no bindings of its own
 * and nothing to keep in step with the graph. What a node adds is only where it sits (`PatchNode.panel`). These are the
 * pure edits and the one derivation (`panelItems`); every edit returns the same patch when nothing changes.
 */

export type PanelKind = 'knob' | 'slider' | 'xy' | 'switch'

/** A control as the board draws it. */
export interface PanelItem {
  readonly node: PatchNode
  readonly kind: PanelKind
  /** A slider lying down. */
  readonly horizontal: boolean
  readonly size: ControlSize
  /** `false`: kept off the board (edit mode lists these so they can be brought back). */
  readonly shown: boolean
}

const DEFAULT_SIZE: Record<PanelKind, ControlSize> = { knob: 'S', slider: 'S', switch: 'S', xy: 'M' }

/** The size a control of this kind has until it is resized (an XY pad needs room). */
export const defaultPanelSize = (kind: PanelKind): ControlSize => DEFAULT_SIZE[kind]

/** What a node is on the panel, or undefined when it is not a control. */
const kindOf = (node: PatchNode, modules: ModuleLibrary): Pick<PanelItem, 'kind' | 'horizontal'> | undefined => {
  switch (describeNode(node, modules)?.panelKind) {
    case 'value':
      return node.display === 'slider' || node.display === 'slider-horizontal'
        ? { kind: 'slider', horizontal: node.display === 'slider-horizontal' }
        : { kind: 'knob', horizontal: false }
    case 'xy':
      return { kind: 'xy', horizontal: false }
    case 'switch':
      return { kind: 'switch', horizontal: false }
    default:
      return undefined
  }
}

/**
 * The patch's control nodes in board order: those with an `order` first, by it, then the rest in the order of the patch
 * (a control added later lands at the end).
 */
export const panelItems = (patch: Patch, modules: ModuleLibrary): readonly PanelItem[] =>
  patch.nodes
    .flatMap((node, index) => {
      const kind = kindOf(node, modules)
      return kind ? [{ node, index, ...kind }] : []
    })
    .sort((a, b) => (a.node.panel?.order ?? Infinity) - (b.node.panel?.order ?? Infinity) || a.index - b.index)
    .map(({ node, kind, horizontal }) => ({
      node,
      kind,
      horizontal,
      size: node.panel?.size ?? DEFAULT_SIZE[kind],
      shown: node.panel?.show !== false,
    }))

/** Writes `panel` on a node, leaving no field when nothing differs from the defaults. */
const withNodePanel = (node: PatchNode, panel: NonNullable<PatchNode['panel']>): PatchNode => {
  const { panel: _previous, ...rest } = node
  return Object.keys(panel).length === 0 ? rest : { ...rest, panel }
}

const mapNode = (patch: Patch, id: string, change: (node: PatchNode) => PatchNode): Patch => {
  const node = patch.nodes.find((candidate) => candidate.id === id)
  if (!node) return patch
  const next = change(node)
  return next === node ? patch : { ...patch, nodes: patch.nodes.map((candidate) => (candidate === node ? next : candidate)) }
}

/** Shows a control on the board or hides it (it keeps working in the graph either way). */
export const setPanelShow = (patch: Patch, modules: ModuleLibrary, id: string, show: boolean): Patch =>
  mapNode(patch, id, (node) => {
    if (!kindOf(node, modules) || (node.panel?.show !== false) === show) return node
    const { show: _previous, ...rest } = node.panel ?? {}
    return withNodePanel(node, show ? rest : { ...rest, show: false })
  })

/** Resizes a control; its kind's default size is stored as nothing. */
export const resizePanelControl = (patch: Patch, modules: ModuleLibrary, id: string, size: ControlSize): Patch =>
  mapNode(patch, id, (node) => {
    const kind = kindOf(node, modules)
    if (!kind || (node.panel?.size ?? DEFAULT_SIZE[kind.kind]) === size) return node
    const { size: _previous, ...rest } = node.panel ?? {}
    return withNodePanel(node, size === DEFAULT_SIZE[kind.kind] ? rest : { ...rest, size })
  })

/** Moves a control to `index` in the board order (clamped to the ends); the whole board is then numbered. */
export const movePanelControl = (patch: Patch, modules: ModuleLibrary, id: string, index: number): Patch => {
  const ids = panelItems(patch, modules).map((item) => item.node.id)
  const from = ids.indexOf(id)
  if (from === -1) return patch
  const to = Math.min(ids.length - 1, Math.max(0, Math.trunc(Number.isFinite(index) ? index : from)))
  if (to === from) return patch
  ids.splice(to, 0, ...ids.splice(from, 1))
  const position = new Map(ids.map((nodeId, order) => [nodeId, order]))
  return {
    ...patch,
    nodes: patch.nodes.map((node) => {
      const order = position.get(node.id)
      return order === undefined ? node : withNodePanel(node, { ...node.panel, order })
    }),
  }
}

/** Gives every control its place in the order (what a migration or a first reorder does), keeping the rest of what it has. */
export const numberPanel = (patch: Patch, modules: ModuleLibrary): Patch => {
  const ids = panelItems(patch, modules).map((item) => item.node.id)
  const position = new Map(ids.map((nodeId, order) => [nodeId, order]))
  let changed = false
  const nodes = patch.nodes.map((node) => {
    const order = position.get(node.id)
    if (order === undefined || node.panel?.order === order) return node
    changed = true
    return withNodePanel(node, { ...node.panel, order })
  })
  return changed ? { ...patch, nodes } : patch
}

/** Where a new panel-made node goes on the canvas: a row below everything, so it is out of the way but findable. */
export const spotBelow = (patch: Patch, index = 0): { x: number; y: number } => ({
  x: 40 + (index % 6) * 196,
  y: Math.max(0, ...patch.nodes.map((node) => node.y)) + 180 + Math.floor(index / 6) * 120,
})
