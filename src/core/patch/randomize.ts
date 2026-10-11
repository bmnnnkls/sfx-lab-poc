import { createRng, fromSlider, paramPortId, snapToStep, toSlider } from '../dsp'
import type { ModuleLibrary } from './module-types'
import { describeNode, resolveSpec } from './node-shape'
import type { Patch } from './types'

/**
 * Re-rolls a patch's settings, the way a sound-effect generator does: `randomizeParams` with the default amount picks every setting
 * anywhere in its range; a smaller `amount` only nudges each by up to that much of its range (a mutation: the same sound, a little
 * different). Everything is drawn from the `seed`, so the same seed on the same patch gives the same result, and a result worth
 * keeping can be got back by remembering its number. Pure: the patch comes back changed, or the same object when nothing changed.
 */
export interface RandomizeOptions {
  readonly seed: number
  /** 0 changes nothing, 1 (the default) picks anywhere in the range. Between: how far each setting may move, as a part of its range. */
  readonly amount?: number
}

/** A range wider than this is a free number (a math node's operand), not a knob: it is left alone. */
const MAX_SPAN = 50000

/** The settings of a control node that carry its value; its range, step and curve are what the value is judged against, not randomized. */
const VALUE_PARAMS: Readonly<Record<string, readonly string[]>> = { value: ['value'], xy: ['x', 'y'], selector: ['index'] }

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value))

/**
 * The settings `randomizeParams` would touch: numbers within a knob-sized range and choices, on nodes that are not locked, leaving
 * out what a wire drives (the wire's value wins anyway), a control's range, and switches and indicators (a switch is for pressing).
 */
export const randomizeParams = (patch: Patch, modules: ModuleLibrary, options: RandomizeOptions): Patch => {
  const amount = clamp(Number.isFinite(options.amount ?? 1) ? (options.amount ?? 1) : 1, 0, 1)
  if (amount === 0) return patch
  const rng = createRng(options.seed)
  const driven = new Set(patch.connections.map((connection) => `${connection.to.node}:${connection.to.port}`))
  let changed = false

  const nodes = patch.nodes.map((node) => {
    if (node.locked === true) return node
    const shape = describeNode(node, modules)
    if (!shape) return node
    const allowed = shape.panelKind === undefined ? undefined : (VALUE_PARAMS[shape.panelKind] ?? [])
    let params = node.params

    for (const spec of shape.params) {
      if (allowed && !allowed.includes(spec.id)) continue
      if (driven.has(`${node.id}:${paramPortId(spec.id)}`)) continue
      const live = resolveSpec(node, spec)
      // A selector's value only runs up to the number of positions it has.
      const high = shape.panelKind === 'selector' && spec.id === 'index' ? Math.max(1, Math.round(node.params.count ?? 4)) - 1 : live.max
      const low = live.min
      if (!Number.isFinite(low) || !Number.isFinite(high) || high - low > MAX_SPAN || high <= low) continue
      const before = clamp(params[spec.id] ?? spec.default, low, high)

      let next: number
      if (spec.options) {
        // A choice has no "a little": it changes with the chance `amount`, to any of the options.
        if (amount < 1 && rng.next() >= amount) continue
        next = Math.min(spec.options.length - 1, Math.floor(rng.next() * spec.options.length))
      } else {
        const bounded = { ...live, min: low, max: high }
        const position = amount >= 1 ? rng.next() : clamp(toSlider(bounded, before) + (rng.next() * 2 - 1) * amount, 0, 1)
        const value = snapToStep(bounded, fromSlider(bounded, position))
        // Six significant digits keep the saved file free of 0.30000000000000004.
        next = clamp(Number(value.toPrecision(6)), low, high)
      }
      if (!Number.isFinite(next) || next === params[spec.id]) continue
      params = { ...params, [spec.id]: next }
    }

    if (params === node.params) return node
    changed = true
    return { ...node, params }
  })

  return changed ? { ...patch, nodes } : patch
}
