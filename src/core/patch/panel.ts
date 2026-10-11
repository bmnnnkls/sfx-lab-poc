import { createId } from '../shared'
import type { ModuleLibrary } from './module-types'
import { describeNode } from './node-shape'
import {
  type ControlDraft,
  type ControlSize,
  MAX_PANEL_CONTROLS,
  type PanelControl,
  type ParamBinding,
} from './panel-types'
import type { ParamSpec } from '../dsp'
import type { Patch } from './types'

/**
 * Pure edits of a patch's front panel. A panel is an ordered list of controls bound to node parameters; every edit
 * returns the same patch when nothing changes (no empty undo step).
 */

/** The parameter a binding points at, or `undefined` when the node or the parameter is gone. */
export const resolveBinding = (patch: Patch, modules: ModuleLibrary, binding: ParamBinding): ParamSpec | undefined => {
  const node = patch.nodes.find((candidate) => candidate.id === binding.node)
  return node && describeNode(node, modules)?.params.find((spec) => spec.id === binding.param)
}

const sameBinding = (a: ParamBinding, b: ParamBinding): boolean => a.node === b.node && a.param === b.param

/** Does the control fit its parameters? A selector needs a named-values parameter, the others a number; a pad needs two different ones. */
export const controlFits = (patch: Patch, modules: ModuleLibrary, control: Pick<PanelControl, 'kind' | 'bind' | 'bindY'>): boolean => {
  const x = resolveBinding(patch, modules, control.bind)
  if (!x) return false
  if (control.kind === 'selector') return x.options !== undefined && control.bindY === undefined
  if (x.options !== undefined) return false
  if (control.kind !== 'xy') return control.bindY === undefined
  if (!control.bindY || sameBinding(control.bind, control.bindY)) return false
  const y = resolveBinding(patch, modules, control.bindY)
  return y !== undefined && y.options === undefined
}

const DEFAULT_SIZE: Record<PanelControl['kind'], ControlSize> = { knob: 'S', slider: 'S', selector: 'S', xy: 'M' }

/** The size a new control of this kind starts with (an XY pad needs room). */
export const defaultControlSize = (kind: PanelControl['kind']): ControlSize => DEFAULT_SIZE[kind]

const panelOf = (patch: Patch): readonly PanelControl[] => patch.panel ?? []

/** `panel: undefined` is not written: an empty panel is the same as none. */
const withPanel = (patch: Patch, panel: readonly PanelControl[]): Patch => {
  if (panel.length === 0) {
    if (patch.panel === undefined) return patch
    const { panel: _gone, ...rest } = patch
    return rest
  }
  return { ...patch, panel }
}

/** What a control is called when nobody named it: its parameter, or `X / Y` for a pad. */
export const defaultControlLabel = (patch: Patch, modules: ModuleLibrary, draft: Pick<ControlDraft, 'bind' | 'bindY'>): string => {
  const x = resolveBinding(patch, modules, draft.bind)?.label ?? ''
  const y = draft.bindY ? resolveBinding(patch, modules, draft.bindY)?.label : undefined
  return y ? `${x} / ${y}` : x
}

const labelFor = (patch: Patch, modules: ModuleLibrary, draft: ControlDraft): string =>
  draft.label?.trim() || defaultControlLabel(patch, modules, draft)

/** Adds a control at the end. Refused (same patch) when the parameters do not exist or do not suit the kind, or the panel is full. */
export const addControl = (patch: Patch, modules: ModuleLibrary, draft: ControlDraft): Patch => {
  if (panelOf(patch).length >= MAX_PANEL_CONTROLS || !controlFits(patch, modules, draft)) return patch
  const control: PanelControl = {
    id: createId('control'),
    kind: draft.kind,
    label: labelFor(patch, modules, draft),
    bind: draft.bind,
    ...(draft.bindY ? { bindY: draft.bindY } : {}),
    size: draft.size ?? DEFAULT_SIZE[draft.kind],
    ...(draft.kind === 'slider' && draft.orientation === 'horizontal' ? { orientation: 'horizontal' as const } : {}),
  }
  return withPanel(patch, [...panelOf(patch), control])
}

const mapControl = (patch: Patch, id: string, change: (control: PanelControl) => PanelControl): Patch => {
  const panel = patch.panel
  if (!panel) return patch
  let changed = false
  const next = panel.map((control) => {
    if (control.id !== id) return control
    const updated = change(control)
    if (updated !== control) changed = true
    return updated
  })
  return changed ? { ...patch, panel: next } : patch
}

export const removeControl = (patch: Patch, id: string): Patch =>
  panelOf(patch).some((control) => control.id === id)
    ? withPanel(patch, panelOf(patch).filter((control) => control.id !== id))
    : patch

/** Moves a control to `index` in the order (clamped to the ends). */
export const moveControl = (patch: Patch, id: string, index: number): Patch => {
  const panel = panelOf(patch)
  const from = panel.findIndex((control) => control.id === id)
  if (from === -1) return patch
  const to = Math.min(panel.length - 1, Math.max(0, Math.trunc(Number.isFinite(index) ? index : from)))
  if (to === from) return patch
  const next = [...panel]
  const [moved] = next.splice(from, 1)
  if (!moved) return patch
  next.splice(to, 0, moved)
  return { ...patch, panel: next }
}

/** A blank name is refused (the control would have no label); the name is trimmed. */
export const renameControl = (patch: Patch, id: string, label: string): Patch => {
  const name = label.trim()
  return name === '' ? patch : mapControl(patch, id, (control) => (control.label === name ? control : { ...control, label: name }))
}

export const resizeControl = (patch: Patch, id: string, size: ControlSize): Patch =>
  mapControl(patch, id, (control) => (control.size === size ? control : { ...control, size }))

/** Sliders only; vertical is the default and is stored as no field. */
export const setControlOrientation = (patch: Patch, id: string, orientation: 'vertical' | 'horizontal'): Patch =>
  mapControl(patch, id, (control) => {
    if (control.kind !== 'slider' || (control.orientation ?? 'vertical') === orientation) return control
    const { orientation: _previous, ...rest } = control
    return orientation === 'horizontal' ? { ...rest, orientation } : rest
  })

/** Points a control at other parameters (same kind rules as `addControl`). */
export const rebindControl = (
  patch: Patch,
  modules: ModuleLibrary,
  id: string,
  bind: ParamBinding,
  bindY?: ParamBinding,
): Patch =>
  mapControl(patch, id, (control) => {
    const { bindY: _previous, ...rest } = control
    const next: PanelControl = { ...rest, bind, ...(bindY ? { bindY } : {}) }
    if (!controlFits(patch, modules, next)) return control
    return sameBinding(control.bind, bind) &&
      (control.bindY === undefined ? bindY === undefined : bindY !== undefined && sameBinding(control.bindY, bindY))
      ? control
      : next
  })

/** The nodes in reading order (top to bottom, then left to right), which is how someone looks for them on the canvas. */
const readingOrder = (patch: Patch) =>
  [...patch.nodes].sort((a, b) => Math.round(a.y / 60) - Math.round(b.y / 60) || a.x - b.x)

/**
 * Adds a control for every parameter that does not have one yet, node by node in reading order: a selector for a
 * named-values parameter, a knob for the rest. Safe to run again after adding nodes: it only adds what is missing.
 */
export const buildPanel = (patch: Patch, modules: ModuleLibrary): Patch => {
  const bound = new Set(
    panelOf(patch).flatMap((control) => [control.bind, ...(control.bindY ? [control.bindY] : [])]).map((b) => `${b.node}\0${b.param}`),
  )
  let next = patch
  for (const node of readingOrder(patch)) {
    for (const spec of describeNode(node, modules)?.params ?? []) {
      if (bound.has(`${node.id}\0${spec.id}`)) continue
      next = addControl(next, modules, {
        kind: spec.options ? 'selector' : 'knob',
        bind: { node: node.id, param: spec.id },
      })
    }
  }
  return next
}

/** Removes the controls that use any of these nodes (a pad with one dead axis goes whole). */
export const dropControlsOfNodes = (patch: Patch, nodeIds: ReadonlySet<string>): Patch => {
  const uses = (control: PanelControl) => nodeIds.has(control.bind.node) || (control.bindY !== undefined && nodeIds.has(control.bindY.node))
  return panelOf(patch).some(uses) ? withPanel(patch, panelOf(patch).filter((control) => !uses(control))) : patch
}

/**
 * Removes the controls whose parameters no longer exist or no longer suit them (a node removed, a module knob hidden,
 * an enum that became a number). Returns the same patch when everything still fits.
 */
export const prunePanel = (patch: Patch, modules: ModuleLibrary): Patch => {
  const panel = panelOf(patch)
  const kept = panel.filter((control) => controlFits(patch, modules, control))
  return kept.length === panel.length ? patch : withPanel(patch, kept)
}
