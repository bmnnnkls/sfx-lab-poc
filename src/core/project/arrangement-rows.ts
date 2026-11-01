import { type TrackRow, trackRows, visibleRows } from './track-groups'
import type { GroupColour, Project } from './types'

/** A row of the arrangement's timeline: a group's, or a clip track's with the colour of the group it is directly in. */
export type ArrangementRow =
  | Extract<TrackRow, { kind: 'group' }>
  | (Extract<TrackRow, { kind: 'track' }> & { readonly stripe?: GroupColour })

const rowsCache = new WeakMap<readonly TrackRow[], readonly ArrangementRow[]>()

/**
 * The timeline's rows, top to bottom: the shown rows (`visibleRows`) without the returns, which hold no regions. Each
 * track carries its group's colour. The same array while `tracks` and `groups` are, so a selector can return it.
 */
export const arrangementRows = (project: Project): readonly ArrangementRow[] => {
  const visible = visibleRows(trackRows(project))
  const cached = rowsCache.get(visible)
  if (cached) return cached
  const open: { depth: number; colour: GroupColour }[] = []
  const rows = visible.flatMap((row): ArrangementRow[] => {
    while (open.length && open[open.length - 1]!.depth >= row.depth) open.pop()
    if (row.kind === 'group') {
      open.push({ depth: row.depth, colour: row.group.colour })
      return [row]
    }
    if (row.track.kind === 'return') return []
    const stripe = open.at(-1)?.colour
    return [stripe ? { ...row, stripe } : row]
  })
  rowsCache.set(visible, rows)
  return rows
}
