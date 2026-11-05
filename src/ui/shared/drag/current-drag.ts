import type { DragPayload } from '@state'

/** The data type our drags carry. Anything else (a flexlayout tab, files, a control reorder) isn't ours. */
export const DRAG_TYPE = 'application/x-sfxlab-drag'

/**
 * The drag of ours in progress. A module variable, not a store, so a drag re-renders nothing: `dragover` can't read
 * `dataTransfer`'s data (only its types), so the payload is kept from `dragstart`.
 */
let current: DragPayload | null = null

/** The target showing `data-drop`: only the one under the pointer does. */
let marked: HTMLElement | null = null

/**
 * Marks the target under the pointer as taking the drag or refusing it. A refusal with a reason shows it as the
 * target's tooltip and in `data-drop-reason`, for a target to draw while the drag is on it (a tooltip doesn't show
 * during a drag); the target's own tooltip comes back when the mark goes.
 */
export const mark = (element: HTMLElement | null, state?: 'accept' | 'refuse', reason?: string) => {
  if (marked && marked !== element) unmark(marked)
  marked = element
  if (!element || !state) return
  element.dataset.drop = state
  if (reason === element.dataset.dropReason) return
  if (element.dataset.dropReason === undefined) element.dataset.dropTitle = element.title
  if (reason) {
    element.dataset.dropReason = reason
    element.title = reason
  } else restoreTitle(element)
}

const restoreTitle = (element: HTMLElement) => {
  if (element.dataset.dropReason === undefined) return
  element.title = element.dataset.dropTitle ?? ''
  if (!element.title) element.removeAttribute('title')
  delete element.dataset.dropReason
  delete element.dataset.dropTitle
}

export const unmark = (element: HTMLElement) => {
  restoreTitle(element)
  delete element.dataset.drop
  delete element.dataset.edge
  element.style.removeProperty('--drop-at')
  if (marked === element) marked = null
}

/** Ends the drag: its source may be gone (hidden by a spring-loaded tab), so the window listens too. */
const end = () => {
  current = null
  if (marked) unmark(marked)
}

let listening = false

export const startDrag = (payload: DragPayload) => {
  current = payload
  if (listening) return
  listening = true
  // In the capture phase, since a target stops the drop it handles; after the target, which reads the data itself.
  window.addEventListener('drop', () => setTimeout(end), true)
  window.addEventListener('dragend', end, true)
}

export const endDrag = end

/** Whether a drag of ours is in progress. */
export const dragging = (): boolean => current !== null

/** The payload of a drag event, when it is a drag of ours. */
export const ourDrag = (event: { dataTransfer: DataTransfer | null }): DragPayload | null =>
  current && event.dataTransfer?.types.includes(DRAG_TYPE) ? current : null
