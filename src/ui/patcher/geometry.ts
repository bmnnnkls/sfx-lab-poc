import type { NodeShape, PatchNode } from '@core'

export const NODE_WIDTH = 176
export const HEADER_HEIGHT = 28
export const PORT_ROW_HEIGHT = 22
export const MODULE_FOOTER_HEIGHT = 34
/** A card's picture (`previews/`) and the space around it. */
export const PREVIEW_AREA_HEIGHT = 44
/** The room a control's working widget takes on its card, by what kind of control it is (a knob with its value, an XY pad, a switch, a row of buttons). */
export const LIVE_WIDGET_HEIGHT = { value: 84, xy: 140, switch: 44, selector: 44 } as const

/** The height of a card's live widget, or 0 when the node has none (it is not a settable control). */
export const liveWidgetHeight = (definition: NodeShape): number =>
  definition.panelKind === 'value' || definition.panelKind === 'xy' || definition.panelKind === 'switch' || definition.panelKind === 'selector' ? LIVE_WIDGET_HEIGHT[definition.panelKind] : 0

const BODY_PADDING = 6

export interface Point {
  readonly x: number
  readonly y: number
}

const portRowCount = (definition: NodeShape): number =>
  Math.max(definition.inputs.length, definition.outputs.length)

export const nodeHeight = (definition: NodeShape, isModule = false, hasPicture = false): number =>
  HEADER_HEIGHT +
  BODY_PADDING * 2 +
  portRowCount(definition) * PORT_ROW_HEIGHT +
  (hasPicture || definition.indicator === true ? PREVIEW_AREA_HEIGHT : 0) +
  liveWidgetHeight(definition) +
  (isModule ? MODULE_FOOTER_HEIGHT : 0)

/** Canvas position of a port's connection dot. Layout is fixed, so no DOM measuring is needed. */
export const portPosition = (
  node: PatchNode,
  definition: NodeShape,
  direction: 'inputs' | 'outputs',
  portId: string,
): Point => {
  const row = Math.max(0, definition[direction].findIndex((port) => port.id === portId))
  return {
    x: node.x + (direction === 'inputs' ? 0 : NODE_WIDTH),
    y: node.y + HEADER_HEIGHT + BODY_PADDING + row * PORT_ROW_HEIGHT + PORT_ROW_HEIGHT / 2,
  }
}

/** SVG path for a smooth horizontal wire between two points. */
export const wirePath = (from: Point, to: Point): string => {
  const bend = Math.max(40, Math.abs(to.x - from.x) / 2)
  return `M ${from.x} ${from.y} C ${from.x + bend} ${from.y}, ${to.x - bend} ${to.y}, ${to.x} ${to.y}`
}
