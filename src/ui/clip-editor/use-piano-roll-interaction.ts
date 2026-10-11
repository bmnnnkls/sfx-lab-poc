import {
  DEFAULT_VELOCITY,
  type Note,
  moveNotes,
  notesEqual,
  notesInRegion,
  pasteNotes,
  removeNotes,
  shiftedCopies,
  snapDown,
  trimNotesToLength,
} from '@core'
import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from 'react'
import { type Gesture, type Pointer, applyGesture, beginDraw, marqueeRegion } from './note-gestures'
import { noteClipboard } from './note-clipboard'
import { pitchAtY } from './piano-roll-geometry'

/** Two clicks on the same note this close together delete it. */
const DOUBLE_CLICK_MS = 350

/** A rubber-band box in pixels, relative to the roll's note area. */
export interface MarqueeBox {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

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
  /** Hear a note while editing it (placing, grabbing, changing its pitch). */
  onAudition?(pitch: number, velocity: number): void
}

const noteElementAt = (target: EventTarget): HTMLElement | null =>
  target instanceof HTMLElement ? target.closest<HTMLElement>('[data-note-id]') : null

const union = (a: ReadonlySet<string>, b: ReadonlySet<string>): Set<string> => new Set([...a, ...b])

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
  onAudition,
}: Options) => {
  const surface = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  /** The note currently pressed, and whether this press is the second half of a double-click. */
  const pressed = useRef<{ id: string; double: boolean } | null>(null)
  /** The last press-and-release on a note that did not drag it. */
  const lastClick = useRef<{ id: string; at: number } | null>(null)
  const marqueeBase = useRef<ReadonlySet<string> | null>(null)
  const lastAudition = useRef<number | null>(null)
  /** Where the mouse last was over the roll (snapped): Ctrl+V pastes there. */
  const hoverBeat = useRef(0)
  /** After a paste, repeated pastes with the mouse left alone follow on after the previous one. */
  const pasteOffset = useRef<{ hover: number; offset: number } | null>(null)
  const [draft, setDraft] = useState<readonly Note[] | null>(null)
  const [marquee, setMarquee] = useState<MarqueeBox | null>(null)
  const grid = { step, lengthBeats }

  // Forget selected notes that no longer exist (deleted, or undone away).
  useEffect(() => {
    const present = new Set(notes.map((note) => note.id))
    if ([...selected].some((id) => !present.has(id))) {
      onSelect(new Set([...selected].filter((id) => present.has(id))))
    }
  }, [notes, selected, onSelect])

  const surfacePoint = (event: PointerEvent): { x: number; y: number } => {
    const bounds = surface.current?.getBoundingClientRect()
    return bounds ? { x: event.clientX - bounds.left, y: event.clientY - bounds.top } : { x: 0, y: 0 }
  }

  const pointerOf = (event: PointerEvent): Pointer => {
    const { x, y } = surfacePoint(event)
    return { beat: x / pixelsPerBeat, pitch: pitchAtY(y) }
  }

  const audition = (pitch: number, velocity: number) => {
    lastAudition.current = pitch
    onAudition?.(pitch, velocity)
  }

  const finish = (commit: boolean, now: number) => {
    marqueeBase.current = null
    setMarquee(null)
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

      // Shift toggles a note in or out of the selection wherever on the note it lands, handles included.
      if (event.shiftKey) {
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

      const note = notes.find((candidate) => candidate.id === id)
      if (note && !part) audition(note.pitch, note.velocity)

      const ids = selected.has(id) ? selected : new Set([id])
      onSelect(ids)
      gesture.current = {
        kind: part === 'start' ? 'resize-start' : part === 'end' ? 'resize-end' : 'move',
        origin: notes,
        ids,
        anchor,
      }
    } else if (event.ctrlKey || event.metaKey) {
      // Rubber-band selection (plain drag on empty space draws a note instead).
      lastClick.current = null
      pressed.current = null
      const { x, y } = surfacePoint(event)
      marqueeBase.current = event.shiftKey ? selected : new Set()
      setMarquee({ x0: x, y0: y, x1: x, y1: y })
      if (!event.shiftKey) onSelect(new Set())
    } else {
      lastClick.current = null
      pressed.current = null
      const drawing = beginDraw(notes, anchor, grid)
      gesture.current = drawing
      onSelect(new Set(drawing.kind === 'draw' ? [drawing.drawn.id] : []))
      setDraft(applyGesture(drawing, anchor, grid))
      audition(anchor.pitch, DEFAULT_VELOCITY)
    }
    surface.current?.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    hoverBeat.current = Math.max(0, snapDown(pointerOf(event).beat, step))
    const base = marqueeBase.current
    if (base && marquee) {
      const { x, y } = surfacePoint(event)
      const box = { ...marquee, x1: x, y1: y }
      setMarquee(box)
      const region = marqueeRegion(
        { beat: box.x0 / pixelsPerBeat, pitch: pitchAtY(box.y0) },
        { beat: box.x1 / pixelsPerBeat, pitch: pitchAtY(box.y1) },
      )
      onSelect(union(base, notesInRegion(notes, region)))
      return
    }

    const current = gesture.current
    if (!current) return
    const next = applyGesture(current, pointerOf(event), grid)
    setDraft(next)

    // Dragging a note to a new pitch plays that pitch, like sliding along a keyboard.
    if (current.kind === 'move' && pressed.current) {
      const moved = next.find((note) => note.id === pressed.current?.id)
      if (moved && moved.pitch !== lastAudition.current) audition(moved.pitch, moved.velocity)
    }
  }

  const onContextMenu = (event: { target: EventTarget; preventDefault(): void }) => {
    event.preventDefault()
    const noteElement = noteElementAt(event.target)
    if (!noteElement) return
    onSelect(new Set())
    onCommit(removeNotes(notes, new Set([noteElement.dataset.noteId as string])))
  }

  const copySelection = (): readonly Note[] => {
    const chosen = notes.filter((note) => selected.has(note.id))
    if (chosen.length > 0) noteClipboard.set(chosen)
    return chosen
  }

  const paste = () => {
    const copied = noteClipboard.get()
    const hover = hoverBeat.current
    const previous = pasteOffset.current
    const offset = previous && previous.hover === hover ? previous.offset : 0

    const result = pasteNotes(notes, copied, hover + offset, lengthBeats)
    if (result.pastedIds.size === 0) return
    onCommit(result.notes)
    onSelect(result.pastedIds)

    const first = Math.min(...copied.map((note) => note.start))
    const last = Math.max(...copied.map((note) => note.start + note.duration))
    pasteOffset.current = {
      hover,
      offset: offset + Math.max(step, snapDown(last - first + step - 1e-9, step)),
    }
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

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const command = event.ctrlKey || event.metaKey
    const key = event.key
    const letter = key.toLowerCase()

    if (key === 'Escape') {
      if (gesture.current || marqueeBase.current) finish(false, 0)
      else onSelect(new Set())
    } else if (command && letter === 'a') {
      onSelect(new Set(notes.map((note) => note.id)))
    } else if (command && letter === 'd') {
      duplicateSelection()
    } else if (command && letter === 'c') {
      copySelection()
    } else if (command && letter === 'x') {
      if (copySelection().length > 0) {
        onCommit(removeNotes(notes, selected))
        onSelect(new Set())
      }
    } else if (command && letter === 'v') {
      paste()
    } else if ((key === 'Delete' || key === 'Backspace') && selected.size > 0) {
      onCommit(removeNotes(notes, selected))
      onSelect(new Set())
    } else if (key.startsWith('Arrow') && selected.size > 0 && !gesture.current) {
      const octave = event.shiftKey ? 12 : 1
      const [beats, semitones] =
        key === 'ArrowLeft' ? [-step, 0] : key === 'ArrowRight' ? [step, 0] : key === 'ArrowUp' ? [0, octave] : [0, -octave]
      const moved = moveNotes(notes, selected, beats, semitones, lengthBeats)
      onCommit(moved)
      const heard = semitones !== 0 ? moved.find((note) => selected.has(note.id)) : undefined
      if (heard) audition(heard.pitch, heard.velocity)
    } else {
      return
    }
    event.preventDefault()
  }

  return {
    surface,
    /** The notes to draw: the in-progress gesture if any, else the real ones. */
    visibleNotes: draft ?? notes,
    marquee,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (event: PointerEvent) => finish(true, event.timeStamp),
      onPointerCancel: (event: PointerEvent) => finish(false, event.timeStamp),
      onContextMenu,
      onKeyDown,
    },
  }
}
