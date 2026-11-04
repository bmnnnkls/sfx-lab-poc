import type { DropTarget, SubjectOf } from '@state'
import type { DragEvent } from 'react'
import { ourDrag } from './current-drag'
import { useDropTarget } from './use-drag'

/**
 * Which side of the element the pointer is on, along `axis`: before or after by halves, or for a group by thirds,
 * the middle third being inside it.
 */
const edgeAt = (event: DragEvent<HTMLElement>, axis: 'x' | 'y', inside: boolean): 'before' | 'after' | 'inside' => {
  const rect = event.currentTarget.getBoundingClientRect()
  const along = axis === 'x' ? (event.clientX - rect.left) / (rect.width || 1) : (event.clientY - rect.top) / (rect.height || 1)
  if (!inside) return along < 0.5 ? 'before' : 'after'
  return along < 1 / 3 ? 'before' : along > 2 / 3 ? 'after' : 'inside'
}

/**
 * The drop props of a track or a group that a dragged track or group lands next to (or in), on the side the pointer is
 * on along `axis`. While one is over it, the element shows that side as `data-edge`. Presets and library items land on
 * the track as before.
 */
export const useEdgeTarget = (subject: SubjectOf<'track'> | SubjectOf<'group'>, axis: 'x' | 'y') =>
  useDropTarget(
    (event) => ({ ...subject, edge: edgeAt(event, axis, subject.kind === 'group') }) as DropTarget,
    (event, target) => {
      const kind = ourDrag(event)?.kind
      const edge = kind === 'track' || kind === 'group' ? (target as SubjectOf<'track' | 'group'>).edge : undefined
      if (edge) event.currentTarget.dataset.edge = edge
      else delete event.currentTarget.dataset.edge
    },
  )
