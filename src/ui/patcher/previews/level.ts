import { type Preview, type Values, MID, PREVIEW_WIDTH, clamp, round } from './types'

const BAR_HEIGHT = 8
const SIDE = 4
const TRACK = PREVIEW_WIDTH - 2 * SIDE

/** Gain as a bar from 0 to 2, with a tick at unity (1) where the sound is left as it is. */
export const gainPreview = (values: Values): Preview => {
  const gain = clamp(values.gain ?? 1, 0, 2)
  const top = MID - BAR_HEIGHT / 2
  return {
    shapes: [
      { kind: 'rect', x: SIDE, y: top, width: TRACK, height: BAR_HEIGHT, tone: 'dim', filled: false },
      { kind: 'rect', x: SIDE, y: top, width: round((gain / 2) * TRACK), height: BAR_HEIGHT, tone: 'main', filled: true },
      { kind: 'line', points: [[SIDE + TRACK / 2, top - 3], [SIDE + TRACK / 2, top + BAR_HEIGHT + 3]], tone: 'dim' },
    ],
  }
}

/** Pan as a dot on a line from left to right, with a tick at the centre. */
export const panPreview = (values: Values): Preview => {
  const pan = clamp(values.pan ?? 0, -1, 1)
  return {
    shapes: [
      { kind: 'line', points: [[SIDE, MID], [SIDE + TRACK, MID]], tone: 'dim' },
      { kind: 'line', points: [[SIDE + TRACK / 2, MID - 5], [SIDE + TRACK / 2, MID + 5]], tone: 'dim' },
      { kind: 'dot', x: round(SIDE + ((pan + 1) / 2) * TRACK), y: MID, tone: 'main' },
    ],
  }
}

/** Width as two dots (left and right) around the centre: together at 0 (mono), as far apart as the picture allows at 2. */
export const widthPreview = (values: Values): Preview => {
  const spread = (clamp(values.width ?? 1, 0, 2) / 2) * (TRACK / 2)
  const centre = SIDE + TRACK / 2
  return {
    shapes: [
      { kind: 'line', points: [[SIDE, MID], [SIDE + TRACK, MID]], tone: 'dim' },
      { kind: 'line', points: [[round(centre - spread), MID], [round(centre + spread), MID]], tone: 'main' },
      { kind: 'dot', x: round(centre - spread), y: MID, tone: 'main' },
      { kind: 'dot', x: round(centre + spread), y: MID, tone: 'main' },
    ],
  }
}
