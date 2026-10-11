import {
  type Note,
  type NoteRegion,
  createNote,
  moveNotes,
  resizeNotesEnd,
  resizeNotesStart,
  snapDown,
} from '@core'

/** A pointer position in musical terms: a (fractional) beat and a whole MIDI pitch. */
export interface Pointer {
  readonly beat: number
  readonly pitch: number
}

export interface GridContext {
  /** Snap size in beats. */
  readonly step: number
  readonly lengthBeats: number
}

/**
 * What the mouse is doing. Every gesture is described against the notes as they were when it
 * began (`origin`), so the result is always a pure function of "where the pointer is now" and
 * never accumulates drift.
 */
export type Gesture =
  | { readonly kind: 'draw'; readonly origin: readonly Note[]; readonly anchor: Pointer; readonly drawn: Note }
  | {
      readonly kind: 'move' | 'resize-start' | 'resize-end'
      readonly origin: readonly Note[]
      readonly anchor: Pointer
      readonly ids: ReadonlySet<string>
    }

/** A new one-step note under the pointer, ready to be stretched by dragging. */
export const beginDraw = (origin: readonly Note[], anchor: Pointer, grid: GridContext): Gesture => ({
  kind: 'draw',
  origin,
  anchor,
  drawn: createNote(anchor.pitch, snapDown(anchor.beat, grid.step), grid.step),
})

const snappedDelta = (beats: number, step: number): number => Math.round(beats / step) * step

/** The notes as they should look with the pointer at `pointer`. */
export const applyGesture = (gesture: Gesture, pointer: Pointer, grid: GridContext): Note[] => {
  const { step, lengthBeats } = grid

  if (gesture.kind === 'draw') {
    const lastCell = Math.max(0, Math.round(lengthBeats / step) - 1)
    const cell = (beat: number) => Math.min(lastCell, Math.max(0, Math.floor(beat / step + 1e-9)))
    const first = Math.min(cell(gesture.anchor.beat), cell(pointer.beat))
    const last = Math.max(cell(gesture.anchor.beat), cell(pointer.beat))
    return [
      ...gesture.origin,
      { ...gesture.drawn, start: first * step, duration: (last - first + 1) * step },
    ]
  }

  const delta = snappedDelta(pointer.beat - gesture.anchor.beat, step)
  switch (gesture.kind) {
    case 'move':
      return moveNotes(gesture.origin, gesture.ids, delta, pointer.pitch - gesture.anchor.pitch, lengthBeats)
    case 'resize-end':
      return resizeNotesEnd(gesture.origin, gesture.ids, delta, step, lengthBeats)
    case 'resize-start':
      return resizeNotesStart(gesture.origin, gesture.ids, delta, step)
  }
}

/** The time/pitch box spanned by two pointer positions (for rubber-band selection). */
export const marqueeRegion = (a: Pointer, b: Pointer): NoteRegion => ({
  fromBeat: Math.min(a.beat, b.beat),
  toBeat: Math.max(a.beat, b.beat),
  lowPitch: Math.min(a.pitch, b.pitch),
  highPitch: Math.max(a.pitch, b.pitch),
})
