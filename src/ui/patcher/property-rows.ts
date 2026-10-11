import { type NodeShape, type ParamSpec, type PatchNode, resolveSpec } from '@core'

/** One line of the property editor: a parameter as this node has it, what drives it, and where "reset" goes. */
export interface PropertyRow {
  readonly spec: ParamSpec
  readonly value: number
  /** What is wired into its socket, if anything: the stored value is then ignored. */
  readonly drivenBy?: string
  /** The parameter has a socket, so a control can be made for it. */
  readonly hasSocket: boolean
  readonly resetTo: number
}

/** Past this span a slider is no use for picking a value (the wide bounds of a control's own range): the number field does it. */
const SLIDER_SPAN_LIMIT = 50000

export const showsSlider = (spec: ParamSpec): boolean => spec.options === undefined && spec.max - spec.min < SLIDER_SPAN_LIMIT

/** Where reset goes: a control's value to its own `default`, everything else to the spec's default. */
const resetOf = (node: PatchNode, spec: ParamSpec): number => {
  const holder = spec.range?.reset
  return (holder === undefined ? undefined : node.params[holder]) ?? spec.default
}

export const rowsOf = (node: PatchNode, shape: NodeShape, driven: ReadonlyMap<string, string>): readonly PropertyRow[] =>
  shape.params.map((param) => {
    const spec = resolveSpec(node, param)
    return {
      spec,
      value: node.params[param.id] ?? param.default,
      drivenBy: driven.get(param.id),
      hasSocket: spec.options === undefined && shape.inputs.some((port) => port.param === param.id),
      resetTo: resetOf(node, param),
    }
  })

/** What a number field makes of what was typed: a finite number, or nothing (the field keeps what it had). */
export const parseNumber = (text: string): number | undefined => {
  const trimmed = text.trim().replace(',', '.')
  if (trimmed === '' || trimmed === '-' || trimmed === '.' || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(trimmed)) return undefined
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : undefined
}

/** Keeps a typed value inside the parameter's range (the engine would clamp it anyway; the file should not hold more). */
export const clampToSpec = (spec: ParamSpec, value: number): number => Math.min(spec.max, Math.max(spec.min, value))
