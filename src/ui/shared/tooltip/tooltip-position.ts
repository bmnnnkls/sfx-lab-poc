export interface Box {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface Size {
  readonly width: number
  readonly height: number
}

const GAP = 8
const MARGIN = 8

/**
 * Where a tooltip of `size` goes, in viewport pixels: centred under `target`, above it when there is no room below, and
 * kept inside the viewport sideways (and, for a tooltip taller than the room either side, at the top margin).
 */
export const placeTooltip = (target: Box, size: Size, viewport: Size): { x: number; y: number; side: 'below' | 'above' } => {
  const left = target.x + target.width / 2 - size.width / 2
  const x = Math.max(MARGIN, Math.min(left, viewport.width - size.width - MARGIN))
  const below = target.y + target.height + GAP
  const above = target.y - GAP - size.height
  const fitsBelow = below + size.height + MARGIN <= viewport.height
  if (fitsBelow) return { x, y: below, side: 'below' }
  if (above >= MARGIN) return { x, y: above, side: 'above' }
  return { x, y: Math.max(MARGIN, viewport.height - size.height - MARGIN), side: 'below' }
}
