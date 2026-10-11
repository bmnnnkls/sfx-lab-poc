import { type ModuleLibrary, type Patch, describeNode } from '@core'
import { HEADER_HEIGHT, NODE_WIDTH, type Point, nodeHeight } from './geometry'

/** Room a new card is assumed to need when checking it against the others (a typical one: header, a few ports, a slider or two). */
const NEW_HEIGHT = 90
const NUDGE = 28
const MAX_NUDGES = 60

/** Where the top-left of a new card goes so that it appears centred on the point that was clicked. */
export const centredOn = (point: Point): Point => ({
  x: Math.max(0, Math.round(point.x - NODE_WIDTH / 2)),
  y: Math.max(0, Math.round(point.y - HEADER_HEIGHT / 2)),
})

const overlaps = (a: Point, aHeight: number, b: Point, bHeight: number): boolean =>
  a.x < b.x + NODE_WIDTH && a.x + NODE_WIDTH > b.x && a.y < b.y + bHeight && a.y + aHeight > b.y

/**
 * The wanted place, or the nearest one down and to the right of it where a new card does not sit on another, so adding
 * several nodes in a row (from the Add button, which always aims at the middle) fans them out instead of stacking.
 */
export const freeSpot = (patch: Patch, modules: ModuleLibrary, wanted: Point): Point => {
  const boxes = patch.nodes.map((node) => {
    const shape = describeNode(node, modules)
    return { at: { x: node.x, y: node.y }, height: shape ? nodeHeight(shape, shape.category === 'Modules') : NEW_HEIGHT }
  })
  for (let step = 0; step <= MAX_NUDGES; step++) {
    const spot = { x: wanted.x + step * NUDGE, y: wanted.y + step * NUDGE }
    if (!boxes.some((box) => overlaps(spot, NEW_HEIGHT, box.at, box.height))) return spot
  }
  return wanted
}

/** A popup opened at a point, kept inside the window. */
export const popupPosition = (anchor: Point, size: { width: number; height: number }, viewport: { width: number; height: number }): Point => ({
  x: Math.max(8, Math.min(anchor.x, viewport.width - size.width - 8)),
  y: Math.max(8, Math.min(anchor.y, viewport.height - size.height - 8)),
})
