import type { TrackGroup, TrackRow } from '@core'

type GroupRow = Extract<TrackRow, { kind: 'group' }>

/** What the session grid and the mixer draw side by side: a track, or a collapsed group, with the expanded groups it is in. */
export interface GroupedColumn {
  readonly row: TrackRow
  /** The expanded groups around it, the outermost first. */
  readonly groups: readonly GroupRow[]
}

/** A stretch of columns under one expanded group at one level, or under none (`group` undefined). */
export interface Band {
  readonly group?: GroupRow
  readonly span: number
}

/**
 * The columns of the visible rows: every track and collapsed group; an expanded group is a band over its members. With
 * `buses` (the mixer), an expanded group with a bus also has a column of its own, first under its band.
 */
export const groupedColumns = (rows: readonly TrackRow[], { buses = false } = {}): GroupedColumn[] => {
  const columns: GroupedColumn[] = []
  const open: GroupRow[] = []
  for (const row of rows) {
    while (open.length && open[open.length - 1]!.depth >= row.depth) open.pop()
    if (row.kind === 'group' && !row.group.collapsed) {
      open.push(row)
      if (buses && row.group.bus) columns.push({ row, groups: [...open] })
    } else columns.push({ row, groups: [...open] })
  }
  return columns
}

/** The bands of each level, from the outermost: one per run of columns in the same group, or in none. */
export const bandsOf = (columns: readonly GroupedColumn[]): Band[][] => {
  const levels = Math.max(0, ...columns.map((column) => column.groups.length))
  return Array.from({ length: levels }, (_, level) => {
    const bands: { group?: GroupRow; span: number }[] = []
    for (const column of columns) {
      const group = column.groups[level]
      const last = bands[bands.length - 1]
      if (last && last.group?.group.id === group?.group.id) last.span++
      else bands.push({ group, span: 1 })
    }
    return bands
  })
}

/** The colour of the innermost group a column is in, for its stripe. */
export const stripeOf = (column: GroupedColumn): TrackGroup['colour'] | undefined => column.groups.at(-1)?.group.colour
