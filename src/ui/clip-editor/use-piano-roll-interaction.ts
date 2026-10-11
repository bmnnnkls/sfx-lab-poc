import {
  type Note,
  moveNotes,
  notesEqual,
  removeNotes,
  shiftedCopies,
  snapDown,
  trimNotesToLength,
} from '@core'
import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from 'react'
import { type Gesture, type Pointer, applyGesture, beginDraw } from './note-gestures'
import { ROW_HEIGHT, pitchAtY } from './piano-roll-geometry'

/** Two clicks on the same note this close together delete it. */
const DOUBLE_CLICK_MS = 350

interface Options {
  notes: readonly Note[]
  lengthBeats: number
  /** Grid snap in beats. */
  step: number
  pixelsPerBeat: number
  selected: ReadonlySet<string>
  onSelect(ids: ReadonlySet<string>): void
  /** Called once per finished gesture or keyboard edit, so each is a single undo step. */
  onCommit(notes: readonly Note[]): void
}

const noteElementAt = (target: EventTarget): HTMLElement | null =>
  target instanceof HTMLElement ? target.closest<HTMLElement>('[data-note-id]') : null

/**
 * Mouse and keyboard editing of notes on the roll's surface element.
 * While dragging, edits live in `draft` (shown on screen) and are committed once on release.
 */
export const usePianoRollInteraction = ({
  notes,
  lengthBeats,
  step,
  pixelsPerBeat,
  selected,
  onSelect,
  onCommit,
}: Options) => {
  const surface = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  /** The note currently pressed, and whether this press is the second half of a double-click. */
  const pressed = useRef<{ id: string; double: boolean } | null>(null)
  /** The last press-and-release on a note that did not drag it. */
  const lastClick = useRef<{ id: string; at: number } | null>(null)
  const [draft, setDraft] = useState<readonly Note[] | null>(null)
  const grid = { step, lengthBeats }

  // Forget selected notes that no longer exist (deleted, or undone away).
  useEffect(() => {
    const present = new Set(notes.map((note) => note.id))
    if ([...selected].some((id) => !present.has(id))) {
      onSelect(new Set([...selected].filter((id) => present.has(id))))
    }
  }, [notes, selected, onSelect])

  const pointerOf = (event: PointerEvent): Pointer => {
    const bounds = surface.current?.getBoundingClientRect()
    if (!bounds) return { beat: 0, pitch: 60 }
    return {
      beat: (event.clientX - bounds.left) / pixelsPerBeat,
      pitch: pitchAtY(event.clientY - bounds.top),
    }
  }

  const finish = (commit: boolean, now: number) => {
    const current = gesture.current
    const press = pressed.current
    gesture.current = null
    pressed.current = null
    const result = draft
    setDraft(null)
    if (!commit || !current) {
      lastClick.current = null
      return
    }

    if (result && (current.kind === 'draw' || !notesEqual(result, current.origin))) {
      lastClick.current = null
      onCommit(result)
    } else if (press?.double) {
      // A second click that never turned into a drag: delete the note.
      lastClick.current = null
      onSelect(new Set())
      onCommit(removeNotes(notes, new Set([press.id])))
    } else if (press) {
      lastClick.current = { id: press.id, at: now }
    }
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    surface.current?.focus()
    const anchor = pointerOf(event)
    const noteElement = noteElementAt(event.target)

    if (noteElement) {
      const id = noteElement.dataset.noteId as string
      const part = (event.target as HTMLElement).dataset.part

      if (event.shiftKey && !part) {
        lastClick.current = null
        const next = new Set(selected)
        if (!next.delete(id)) next.add(id)
        onSelect(next)
        return
      }
      const last = lastClick.current
      pressed.current = part
        ? null
        : { id, double: last?.id === id && event.timeStamp - last.at < DOUBLE_CLICK_MS }

      const ids = selected.has(id) ? selected : new Set([id])
      onSelect(ids)
      gesture.current = {
        kind: part === 'start' ? 'resize-start' : part === 'end' ? 'resize-end' : 'move',
        origin: notes,
        ids,
        anchor,
      }
    } else {
      lastClick.current = null
      pressed.current = null
      const drawing = beginDraw(notes, anchor, grid)
      gesture.current = drawing
      onSelect(new Set(drawing.kind === 'draw' ? [drawing.drawn.id] : []))
      setDraft(applyGesture(drawing, anchor, grid))
    }
    surface.current?.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current
    if (current) setDraft(applyGesture(current, pointerOf(event), grid))
  }

  const onContextMenu = (event: { target: EventTarget; preventDefault(): void }) => {
    event.preventDefault()
    const noteElement = noteElementAt(event.target)
    if (!noteElement) return
    onSelect(new Set())
    onCommit(removeNotes(notes, new Set([noteElement.dataset.noteId as string])))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const command = event.ctrlKey || event.metaKey
    const key = event.key

    if (key === 'Escape') {
      if (gesture.current) finish(false, 0)
      else onSelect(new Set())
    } else if (command && key.toLowerCase() === 'a') {
      onSelect(new Set(notes.map((note) => note.id)))
    } else if (command && key.toLowerCase() === 'd') {
      duplicateSelection()
    } else if ((key === 'Delete' || key === 'Backspace') && selected.size > 0) {
      onCommit(removeNotes(notes, selected))
      onSelect(new Set())
    } else if (key.startsWith('Arrow') && selected.size > 0 && !gesture.current) {
      const octave = event.shiftKey ? 12 : 1
      const [beats, semitones] =
        key === 'ArrowLeft' ? [-step, 0] : key === 'ArrowRight' ? [step, 0] : key === 'ArrowUp' ? [0, octave] : [0, -octave]
      onCommit(moveNotes(notes, selected, beats, semitones, lengthBeats))
    } else {
      return
    }
    event.preventDefault()
  }

  /** Copies the selection to just after itself (rounded up to the grid) and selects the copies. */
  const duplicateSelection = () => {
    const chosen = notes.filter((note) => selected.has(note.id))
    if (chosen.length === 0) return
    const first = Math.min(...chosen.map((note) => note.start))
    const last = Math.max(...chosen.map((note) => note.start + note.duration))
    const span = Math.max(step, snapDown(last - first + step - 1e-9, step))
    const copies = trimNotesToLength(shiftedCopies(chosen, span), lengthBeats)
    if (copies.length === 0) return
    onCommit([...notes, ...copies])
    onSelect(new Set(copies.map((note) => note.id)))
  }

  return {
    surface,
    /** The notes to draw: the in-progress gesture if any, else the real ones. */
    visibleNotes: draft ?? notes,
    dragging: draft !== null,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (event: PointerEvent) => finish(true, event.timeStamp),
      onPointerCancel: (event: PointerEvent) => finish(false, event.timeStamp),
      onContextMenu,
      onKeyDown,
    },
    rowHeight: ROW_HEIGHT,
  }
}
