import type { NodeDefinition, ParamSpec, PortSpec } from './types'

/** A parameter `p` appears as the input socket `param:p`. */
export const PARAM_PORT_PREFIX = 'param:'

export const paramPortId = (paramId: string): string => `${PARAM_PORT_PREFIX}${paramId}`

/** The parameter a socket id stands for, or undefined for an ordinary port. */
export const paramOfPort = (portId: string): string | undefined =>
  portId.startsWith(PARAM_PORT_PREFIX) ? portId.slice(PARAM_PORT_PREFIX.length) : undefined

/** Enums are picked, not driven; everything else with a number is a socket. */
const hasSocket = (spec: ParamSpec): boolean => spec.options === undefined

/**
 * The sockets of a node: one `control` input per numeric parameter. Wired, the wire's value replaces the parameter's
 * stored value (read once per block); unwired, the node uses its own value. Generated, not written per node.
 */
export const paramSockets = (definition: Pick<NodeDefinition, 'params' | 'paramSockets'>): readonly PortSpec[] =>
  definition.paramSockets === false
    ? []
    : definition.params
        .filter(hasSocket)
        .map((spec) => ({
          id: paramPortId(spec.id),
          label: spec.label,
          kind: 'control' as const,
          param: spec.id,
          ...(spec.description === undefined ? {} : { description: spec.description }),
          range: { min: spec.min, max: spec.max, default: spec.default, ...(spec.unit === undefined ? {} : { unit: spec.unit }) },
        }))

const CURVES = ['linear', 'log', 'exp'] as const

/**
 * The spec with its range, step and curve taken from the node's own parameters (`ParamSpec.range`); the spec itself
 * when it has none or the node lacks them.
 */
export const liveSpec = (spec: ParamSpec, values: Readonly<Record<string, number>>): ParamSpec => {
  if (!spec.range) return spec
  const low = values[spec.range.min]
  const high = values[spec.range.max]
  if (low === undefined || high === undefined || !Number.isFinite(low) || !Number.isFinite(high)) return spec
  const step = spec.range.step === undefined ? undefined : values[spec.range.step]
  const curveIndex = spec.range.curve === undefined ? undefined : values[spec.range.curve]
  const curve = curveIndex === undefined || !Number.isFinite(curveIndex) ? undefined : CURVES[Math.round(curveIndex)]
  return {
    ...spec,
    min: Math.min(low, high),
    max: Math.max(low, high),
    ...(step !== undefined && step > 0 ? { step } : { step: undefined }),
    ...(curve === undefined ? {} : { curve }),
  }
}

/** Wide positive ranges (20 Hz to 20 kHz) feel right on a logarithmic scale; the single place that says so. */
export const isWideRange = (spec: Pick<ParamSpec, 'min' | 'max'>): boolean => spec.min > 0 && spec.max / spec.min >= 50
