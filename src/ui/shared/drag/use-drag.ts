import { type DragPayload, type DropTarget, dropFor, runDrop } from '@state'
import type { DragEvent, HTMLAttributes } from 'react'
import { useActionContext } from '../menu'
import { DRAG_TYPE, endDrag, mark, ourDrag, startDrag, unmark } from './current-drag'

type DragProps = Pick<HTMLAttributes<HTMLElement>, 'draggable' | 'onDragStart' | 'onDragEnd'>
type DropProps = Pick<HTMLAttributes<HTMLElement>, 'onDragEnter' | 'onDragOver' | 'onDragLeave' | 'onDrop'>

/**
 * The props that make an element a drag source of `payload`. A drag starts only past the browser's own movement
 * threshold, so a click still does what it did. A null payload (a slot being renamed) makes nothing draggable.
 */
export const useDragSource = (payload: DragPayload | null): DragProps => {
  if (!payload) return {}
  return {
    draggable: true,
    onDragStart: (event) => {
      event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload))
      event.dataTransfer.effectAllowed = 'copyMove'
      startDrag(payload)
    },
    onDragEnd: endDrag,
  }
}

/** A target, or one computed from the event: a lane's beat, a canvas's point. Null where nothing can land. */
export type TargetOf = DropTarget | null | ((event: DragEvent<HTMLElement>) => DropTarget | null)

/**
 * The props that make an element a drop target. It looks only at drags of ours, so anything else passes through; for
 * those it asks the drop list, shows `data-drop="accept"` or `"refuse"`, and stops the event, so the innermost target
 * wins. `onOver` sees each accepted `dragover`, for a marker of where it would land.
 */
export const useDropTarget = (target: TargetOf, onOver?: (event: DragEvent<HTMLElement>, target: DropTarget) => void): DropProps => {
  const context = useActionContext()
  const resolve = (event: DragEvent<HTMLElement>) => (typeof target === 'function' ? target(event) : target)
  const over = (event: DragEvent<HTMLElement>) => {
    const payload = ourDrag(event)
    if (!payload) return
    event.stopPropagation()
    const resolved = resolve(event)
    const drop = resolved && dropFor(payload, resolved, context)
    if (!resolved || !drop) {
      mark(event.currentTarget, 'refuse')
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = drop.effect(payload, resolved, { alt: event.altKey })
    mark(event.currentTarget, 'accept')
    onOver?.(event, resolved)
  }
  return {
    onDragEnter: over,
    onDragOver: over,
    onDragLeave: (event) => {
      if (!ourDrag(event) || event.currentTarget.contains(event.relatedTarget as Node | null)) return
      unmark(event.currentTarget)
    },
    onDrop: (event) => {
      if (!ourDrag(event)) return
      event.stopPropagation()
      event.preventDefault()
      unmark(event.currentTarget)
      const payload = JSON.parse(event.dataTransfer.getData(DRAG_TYPE)) as DragPayload
      const resolved = resolve(event)
      if (resolved) void runDrop(payload, resolved, context, { alt: event.altKey })
    },
  }
}
