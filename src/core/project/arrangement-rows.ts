import { type TrackRow, trackRows, visibleRows } from './track-groups'
import type { GroupColour, Project, ReturnTrack } from './types'

/**
 * A row of the arrangement's timeline: a group's, a clip track's with the colour of the group it is directly in, a
 * return's, or the master's. Returns and the master hold no regions; their rows are there for their automation lanes.
 */
export type ArrangementRow =
  | Extract<TrackRow, { kind: 'group' }>
  | (Extract<TrackRow, { kind: 'track' }> & { readonly stripe?: GroupColour })
  | { readonly kind: 'return'; readonly track: ReturnTrack; readonly depth: 0 }
  | { readonly kind: 'master'; readonly depth: 0 }

const MASTER_ROW: ArrangementRow = { kind: 'master', depth: 0 }

const rowsCache = new WeakMap<readonly TrackRow[], readonly ArrangementRow[]>()

/**
 * The timeline's rows, top to bottom: the shown rows (`visibleRows`), groups before their members, then the shown
 * returns and the master, last. Each track carries its group's colour. The same array while `tracks` and `groups` are,
 * so a selector can return it.
 */
export const arrangementRows = (project: Project): readonly ArrangementRow[] => {
  const visible = visibleRows(trackRows(project))
  const cached = rowsCache.get(visible)
  if (cached) return cached
  const open: { depth: number; colour: GroupColour }[] = []
  const returns: ArrangementRow[] = []
  const rows = visible.flatMap((row): ArrangementRow[] => {
    while (open.length && open[open.length - 1]!.depth >= row.depth) open.pop()
    if (row.kind === 'group') {
      open.push({ depth: row.depth, colour: row.group.colour })
      return [row]
    }
    if (row.track.kind === 'return') {
      returns.push({ kind: 'return', track: row.track, depth: 0 })
      return []
    }
    const stripe = open.at(-1)?.colour
    return [stripe ? { ...row, stripe } : row]
  })
  const all = [...rows, ...returns, MASTER_ROW]
  rowsCache.set(visible, all)
  return all
}

/** Whether a row holds regions: a clip track's. */
export const isRegionRow = (row: ArrangementRow): row is Extract<ArrangementRow, { kind: 'track' }> => row.kind === 'track'
