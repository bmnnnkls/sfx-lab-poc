import type { NodeDefinition } from '@core'
import type { PatchNode } from '@core'

export const NODE_WIDTH = 176
export const HEADER_HEIGHT = 28
export const PORT_ROW_HEIGHT = 22
export const PARAM_ROW_HEIGHT = 34
export const SAMPLE_PICKER_HEIGHT = 64
const BODY_PADDING = 6

export interface Point {
  readonly x: number
  readonly y: number
}

const portRowCount = (definition: NodeDefinition): number =>
  Math.max(definition.inputs.length, definition.outputs.length)

export const nodeHeight = (definition: NodeDefinition): number =>
  HEADER_HEIGHT +
  BODY_PADDING * 2 +
  portRowCount(definition) * PORT_ROW_HEIGHT +
  definition.params.length * PARAM_ROW_HEIGHT +
  (definition.usesSample ? SAMPLE_PICKER_HEIGHT : 0)

/** Canvas position of a port's connection dot. Layout is fixed, so no DOM measuring is needed. */
export const portPosition = (
  node: PatchNode,
  definition: NodeDefinition,
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
