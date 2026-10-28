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

export const mark = (element: HTMLElement | null, state?: 'accept' | 'refuse') => {
  if (marked && marked !== element) unmark(marked)
  marked = element
  if (element && state) element.dataset.drop = state
}

export const unmark = (element: HTMLElement) => {
  delete element.dataset.drop
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

/** The payload of a drag event, when it is a drag of ours. */
export const ourDrag = (event: { dataTransfer: DataTransfer | null }): DragPayload | null =>
  current && event.dataTransfer?.types.includes(DRAG_TYPE) ? current : null
