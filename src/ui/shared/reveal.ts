import { type TrackRow, trackRows } from '@core'
import { useProjectStore, useSelectionStore } from '@state'
import { type RefObject, useEffect } from 'react'

/** What a column or lane is marked with (`data-reveal`), so a reveal request can find it. */
export const revealKey = (kind: 'track' | 'group', id: string): string => `${kind === 'track' ? 't' : 'g'}:${id}`

/**
 * The keys to look for: the row itself, then each group around it from the innermost out, since a track inside a
 * collapsed group has no column or lane of its own, only its group's. Empty when the row is not in `rows`.
 */
export const revealKeys = (rows: readonly TrackRow[], kind: 'track' | 'group', id: string): string[] => {
  const index = rows.findIndex((row) => (kind === 'track' ? row.kind === 'track' && row.track.id === id : row.kind === 'group' && row.group.id === id))
  if (index < 0) return []
  const keys = [revealKey(kind, id)]
  let depth = rows[index]!.depth
  for (let at = index - 1; at >= 0 && depth > 0; at--) {
    const row = rows[at]!
    if (row.depth >= depth) continue
    if (row.kind === 'group') keys.push(revealKey('group', row.group.id))
    depth = row.depth
  }
  return keys
}

/**
 * Answers the selection store's reveal requests in one scroller: the first element marked with one of the request's
 * keys is scrolled into view by the least that shows it. Its first child is what is scrolled to: a session column's
 * wrapper (`display: contents`) has no box of its own, and an arrangement lane is as wide as the timeline, so its
 * header (sticky at the left) is what has to show.
 */
export const useRevealRequest = (scroller: RefObject<HTMLElement | null>) => {
  const request = useSelectionStore((state) => state.revealRequest)
  useEffect(() => {
    const root = scroller.current
    if (!request || !root) return
    for (const key of revealKeys(trackRows(useProjectStore.getState().project), request.kind, request.id)) {
      const marked = root.querySelector<HTMLElement>(`[data-reveal="${CSS.escape(key)}"]`)
      if (!marked) continue
      const box = marked.firstElementChild ?? marked
      box.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      return
    }
  }, [request, scroller])
}
