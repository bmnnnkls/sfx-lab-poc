import { type PatchNode, pitchName } from '@core'

/** What the node's settings are, with the defaults of the node when a setting is missing. */
const setting = (node: Pick<PatchNode, 'params'>, id: string, fallback: number): number => {
  const value = node.params[id]
  return value !== undefined && Number.isFinite(value) ? value : fallback
}

export const LED_COLOURS = ['green', 'red', 'amber', 'blue'] as const
export type LedColour = (typeof LED_COLOURS)[number]

export interface LedLook {
  /** 0 (dark) to 1 (fully lit); in on/off mode it is 0 or 1. */
  readonly brightness: number
  readonly lit: boolean
  readonly colour: LedColour
}

/** How an LED looks for the value it is shown. No value (nothing is sounding, or the engine is not running) is dark. */
export const ledLook = (node: Pick<PatchNode, 'params'>, value: number | undefined): LedLook => {
  const colour = LED_COLOURS[Math.min(LED_COLOURS.length - 1, Math.max(0, Math.round(setting(node, 'colour', 0))))] ?? 'green'
  if (value === undefined || !Number.isFinite(value)) return { brightness: 0, lit: false, colour }
  if (Math.round(setting(node, 'mode', 0)) === 1) {
    const low = setting(node, 'low', 0)
    const high = setting(node, 'high', 1)
    const brightness = high === low ? (value >= high ? 1 : 0) : Math.min(1, Math.max(0, (value - low) / (high - low)))
    return { brightness, lit: brightness > 0, colour }
  }
  const lit = value >= setting(node, 'threshold', 0.5)
  return { brightness: lit ? 1 : 0, lit, colour }
}

/** The number display's text: the value to `decimals` places and the node's unit, or a note name; a dash for no value. */
export const displayText = (node: Pick<PatchNode, 'params' | 'unit'>, value: number | undefined): string => {
  if (value === undefined || !Number.isFinite(value)) return '–'
  if (Math.round(setting(node, 'style', 0)) === 1) return pitchName(Math.min(127, Math.max(0, Math.round(value))))
  const decimals = Math.min(6, Math.max(0, Math.round(setting(node, 'decimals', 2))))
  // "-0.00" is not a thing worth showing.
  const text = value.toFixed(decimals).replace(/^-(0(\.0*)?)$/, '$1')
  return node.unit ? `${text} ${node.unit}` : text
}

/** How full a bar meter is, 0 to 1. The ends can be given either way round (an inverted bar fills as the value falls). */
export const barFill = (node: Pick<PatchNode, 'params'>, value: number | undefined): number => {
  if (value === undefined || !Number.isFinite(value)) return 0
  const empty = setting(node, 'min', 0)
  const full = setting(node, 'max', 1)
  if (full === empty) return value >= full ? 1 : 0
  return Math.min(1, Math.max(0, (value - empty) / (full - empty)))
}
