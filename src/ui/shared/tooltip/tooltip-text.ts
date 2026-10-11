import type { NodeShape, ParamSpec, PortSpec } from '@core'
import { formatParam, isLogarithmic } from '../param-scale'

/**
 * The text of a tooltip: what it is, then the facts about its range, then, when a wire is involved, what the wire does.
 * One string, one line per row, so it can sit in a `data-tooltip` attribute and the layer needs to know nothing else.
 */
const rows = (...lines: Array<string | undefined>): string => lines.filter((line): line is string => Boolean(line)).join('\n')

/** A value as a person writes it: no trailing zeros ("20 Hz", not "20.0 Hz"), a note by name. */
const shown = (spec: ParamSpec, value: number): string =>
  spec.format === 'midiNote' ? formatParam(spec, value) : `${Number(value.toPrecision(4))}${spec.unit ? ` ${spec.unit}` : ''}`

/** "Range 20 Hz to 20000 Hz · default 2000 Hz · logarithmic", or the options of an enum. */
export const paramFacts = (spec: ParamSpec): string => {
  if (spec.options) {
    return `Options: ${spec.options.join(', ')} · default ${formatParam(spec, spec.default)}`
  }
  return [
    `Range ${shown(spec, spec.min)} to ${shown(spec, spec.max)}`,
    `default ${shown(spec, spec.default)}`,
    ...(isLogarithmic(spec) ? ['logarithmic'] : []),
  ].join(' · ')
}

/** `drivenBy` names what is wired in ("Control", "Control, Add"): then the stored value is ignored. */
export const paramTooltip = (spec: ParamSpec, drivenBy?: string): string =>
  rows(spec.description, paramFacts(spec), drivenBy === undefined ? undefined : `Driven by ${drivenBy}: the wire replaces this value.`)

const KIND_WORDS: Record<string, string> = {
  stereo: 'Stereo: a left and a right channel.',
  notes: 'Notes: musical events, not sound.',
  control: 'A control: a value that is constant over each block.',
}

/**
 * A port or socket. A socket (`port.param`) shows its parameter's facts, taken from `spec` (the live spec, so a control's
 * own range shows) and says what wiring it does; an ordinary port says what it carries when that is not plain sound.
 */
export const portTooltip = (port: PortSpec, spec?: ParamSpec, drivenBy?: string): string => {
  if (port.param !== undefined) {
    return rows(
      port.description ?? spec?.description,
      spec && paramFacts(spec),
      drivenBy === undefined
        ? 'Wire a control or a signal here to replace the value. It is read once per block, so a fast signal steps rather than glides.'
        : `Driven by ${drivenBy}: the wire replaces the stored value.`,
    )
  }
  return rows(port.description, port.kind === undefined || port.kind === 'signal' ? undefined : KIND_WORDS[port.kind])
}

/** A node: what it does (the descriptions of the shared effects already say they run once for all voices). */
export const nodeTooltip = (shape: NodeShape): string => rows(shape.description)
