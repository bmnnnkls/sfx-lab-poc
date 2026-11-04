import type { TimelineZoom } from '@state'
import { WHEEL_ZOOM } from '../shared/timeline'

/** What a timeline key does, for the handler to apply: each field set is a change. */
export interface TimelineKeyAction {
  /** The position's new beat. */
  readonly position?: number
  /** Zoom by this factor (above 1 in) around the position, or the middle when it is out of view. */
  readonly zoomBy?: number
  readonly zoomTo?: TimelineZoom
  readonly toggleFollow?: true
}

/** What the timeline knows when a key is pressed. */
export interface TimelineKeyState {
  readonly position: number
  /** The grid's step in beats; null with the grid off. */
  readonly gridBeats: number | null
  /** The visible timeline's length in beats, for Alt's tenth. */
  readonly visibleBeats: number
  /** Where *End* goes: the timeline's content end. */
  readonly end: number
  /** *Zoom to selection*'s range, with a region selected. */
  readonly selection: TimelineZoom | null
}

/** A key zooms by two wheel notches. */
const KEY_ZOOM = WHEEL_ZOOM ** 2

/**
 * The arrangement's view keys (`VIEW_KEYS`), as one pure function of the key (`keyOf`'s form) and the timeline. Null
 * for a key that isn't one of them, so the global keys and the browser get it. ← and → move the position a grid step (a
 * beat with the grid off), onto the grid; with Alt, a tenth of the view.
 */
export const timelineKeyAction = (key: string, state: TimelineKeyState): TimelineKeyAction | null => {
  const step = state.gridBeats ?? 1
  const at = (beat: number) => ({ position: Math.max(0, beat) })
  switch (key) {
    case 'arrowleft':
      return at(Math.ceil(state.position / step - 1e-9) * step - step)
    case 'arrowright':
      return at(Math.floor(state.position / step + 1e-9) * step + step)
    case 'alt+arrowleft':
      return at(state.position - state.visibleBeats / 10)
    case 'alt+arrowright':
      return at(state.position + state.visibleBeats / 10)
    case 'home':
      return at(0)
    case 'end':
      return at(state.end)
    case 'plus':
    case '=':
      return { zoomBy: KEY_ZOOM }
    case '-':
      return { zoomBy: 1 / KEY_ZOOM }
    case 'z':
      return state.selection ? { zoomTo: state.selection } : null
    case 'shift+z':
      return { zoomTo: 'fit' }
    case 'f':
      return { toggleFollow: true }
    default:
      return null
  }
}
