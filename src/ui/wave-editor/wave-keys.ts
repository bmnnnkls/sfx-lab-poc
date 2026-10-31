import type { WaveEditorView, WaveSelection, WaveZoom } from '@state'
import { WHEEL_ZOOM, resolveView, xOf, zoomAround } from './wave-geometry'

/**
 * What a view key does, for the handler to apply: each field set is a change, the rest stays. `selection: null` clears
 * the selection; `view` is the stored view's new zoom and scroll.
 */
export interface WaveKeyAction {
  readonly selection?: WaveSelection | null
  readonly cursor?: number
  readonly view?: Pick<WaveEditorView, 'framesPerPixel' | 'startFrame'>
  readonly zoom?: WaveZoom
  readonly play?: true
  /** *Add marker* (M), *Make region* (R) or *Set loop* (L), for the handler to run as the actions. */
  readonly mark?: 'marker' | 'region' | 'loop'
}

/** A key zooms by two wheel notches. */
const KEY_ZOOM = WHEEL_ZOOM ** 2
/** Alt with an arrow moves the cursor by this much of the view. */
const VIEW_STEP = 1 / 10

/**
 * The Wave editor's view keys (`VIEW_KEYS`), as one pure function of the key (`keyOf`'s form: `shift+arrowright`,
 * `mod+a`), the stored view, the sample's length and the detail's width. Returns what to do, or null for a key that
 * isn't one of them, so the browser and the global keys get it.
 *
 * The cursor is the moving end of a selection made with the keys: Shift with an arrow, Home or End moves the end the
 * cursor is on (`from` when the cursor is there, else `to`), and the other end stays. A key that moves the cursor out of
 * the view scrolls the view by the least that shows it. `[` and `]` step the cursor to the previous or next of `marks`
 * (every marker, region edge and loop edge, in frames), and with Shift extend the selection there.
 */
export const waveKeyAction = (key: string, stored: WaveEditorView, frames: number, width: number, marks: readonly number[] = []): WaveKeyAction | null => {
  const view = resolveView(stored, frames, width)
  const { selection, cursor } = stored
  const column = Math.max(1, Math.round(view.framesPerPixel))
  const clamp = (frame: number) => Math.max(0, Math.min(frames, Math.round(frame)))

  /** The action, and a scroll that shows the cursor if it left the view. */
  const following = (action: WaveKeyAction): WaveKeyAction => {
    const at = action.cursor ?? cursor
    const x = xOf(view, at)
    if (x >= 0 && x <= view.width) return action
    const startFrame = x < 0 ? at : at - view.width * view.framesPerPixel
    return { ...action, view: { framesPerPixel: view.framesPerPixel, startFrame: resolveView({ ...stored, framesPerPixel: view.framesPerPixel, startFrame }, frames, width).startFrame } }
  }
  /** Moves the cursor there, without a selection, scrolling the view to show it. */
  const moveTo = (frame: number): WaveKeyAction => following({ selection: null, cursor: clamp(frame) })
  /** The end of the selection the keys move: the cursor's (the cursor itself without a selection). */
  const activeEnd = !selection ? cursor : cursor === selection.from ? selection.from : selection.to
  /** Moves that end there; the other end stays (the cursor, without a selection). */
  const extendTo = (frame: number): WaveKeyAction => {
    const anchor = !selection ? cursor : activeEnd === selection.from ? selection.to : selection.from
    const end = clamp(frame)
    const range = end === anchor ? null : { from: Math.min(anchor, end), to: Math.max(anchor, end), channels: selection?.channels ?? 'both' }
    return following({ selection: range, cursor: end })
  }
  /** Zooms around the cursor, or the view's middle when the cursor is outside it. */
  const zoomBy = (factor: number): WaveKeyAction => {
    const x = xOf(view, cursor)
    const next = zoomAround(view, factor, x >= 0 && x <= view.width ? x : view.width / 2, frames)
    return { view: { framesPerPixel: next.framesPerPixel, startFrame: next.startFrame } }
  }

  /** The nearest mark before or after `frame`, or null at the end of them. */
  const markFrom = (frame: number, direction: -1 | 1): number | null => {
    let found: number | null = null
    for (const mark of marks) if ((direction < 0 ? mark < frame : mark > frame) && (found === null || (direction < 0 ? mark > found : mark < found))) found = mark
    return found
  }
  const stepTo = (direction: -1 | 1, extend: boolean): WaveKeyAction | null => {
    const target = markFrom(extend ? activeEnd : cursor, direction)
    if (target === null) return null
    return extend ? extendTo(target) : moveTo(target)
  }

  switch (key) {
    case '[':
      return stepTo(-1, false)
    case ']':
      return stepTo(1, false)
    // Shift turns the brackets into braces on many layouts.
    case 'shift+[':
    case 'shift+{':
      return stepTo(-1, true)
    case 'shift+]':
    case 'shift+}':
      return stepTo(1, true)
    case 'm':
      return { mark: 'marker' }
    case 'r':
      return { mark: 'region' }
    case 'l':
      return { mark: 'loop' }
    case 'mod+a':
      return { selection: { from: 0, to: frames, channels: selection?.channels ?? 'both' } }
    case 'escape':
      return selection ? { selection: null, cursor: selection.from } : null
    case 'arrowleft':
      return selection ? following({ selection: null, cursor: selection.from }) : moveTo(cursor - column)
    case 'arrowright':
      return selection ? following({ selection: null, cursor: selection.to }) : moveTo(cursor + column)
    case 'shift+arrowleft':
      return extendTo(activeEnd - column)
    case 'shift+arrowright':
      return extendTo(activeEnd + column)
    case 'alt+arrowleft':
      return moveTo((selection?.from ?? cursor) - view.width * view.framesPerPixel * VIEW_STEP)
    case 'alt+arrowright':
      return moveTo((selection?.to ?? cursor) + view.width * view.framesPerPixel * VIEW_STEP)
    case 'home':
      return moveTo(0)
    case 'end':
      return moveTo(frames)
    case 'shift+home':
      return extendTo(0)
    case 'shift+end':
      return extendTo(frames)
    case 'plus':
    case 'shift+plus':
    case '=':
    case 'shift+=':
      return zoomBy(1 / KEY_ZOOM)
    case '-':
      return zoomBy(KEY_ZOOM)
    case 'z':
      return selection ? { zoom: { from: selection.from, to: selection.to } } : null
    case 'shift+z':
      return { zoom: 'fit' }
    case 'p':
      return { play: true }
    default:
      return null
  }
}
