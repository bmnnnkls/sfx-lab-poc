import { type Note, notesEqual, setVelocity } from '@core'
import { type PointerEvent, useRef, useState } from 'react'
import { LANE_HEIGHT, barTop, pickNoteAt, velocityAtY } from './velocity-lane-logic'
import styles from './PianoRoll.module.css'

interface VelocityLaneProps {
  notes: readonly Note[]
  selected: ReadonlySet<string>
  width: number
  pixelsPerBeat: number
  onSelect(ids: ReadonlySet<string>): void
  onCommit(notes: readonly Note[]): void
}

/**
 * One bar per note under the roll, showing and setting how hard it is played. Press a bar and drag
 * up or down; if the note is part of the selection, the whole selection follows. Like the roll
 * itself it edits a draft while dragging and commits once on release.
 */
export const VelocityLane = ({ notes, selected, width, pixelsPerBeat, onSelect, onCommit }: VelocityLaneProps) => {
  const lane = useRef<HTMLDivElement>(null)
  const drag = useRef<{ ids: ReadonlySet<string>; origin: readonly Note[] } | null>(null)
  const [draft, setDraft] = useState<readonly Note[] | null>(null)

  const pointer = (event: PointerEvent): { x: number; y: number } => {
    const bounds = lane.current?.getBoundingClientRect()
    return bounds ? { x: event.clientX - bounds.left, y: event.clientY - bounds.top } : { x: 0, y: 0 }
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const { x, y } = pointer(event)
    const target = pickNoteAt(notes, x, y, pixelsPerBeat)
    if (!target) return
    const ids = selected.has(target.id) ? selected : new Set([target.id])
    onSelect(ids)
    drag.current = { ids, origin: notes }
    setDraft(setVelocity(notes, ids, velocityAtY(y)))
    lane.current?.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current
    if (current) setDraft(setVelocity(current.origin, current.ids, velocityAtY(pointer(event).y)))
  }

  const finish = (commit: boolean) => {
    const current = drag.current
    drag.current = null
    const result = draft
    setDraft(null)
    if (commit && current && result && !notesEqual(result, current.origin)) onCommit(result)
  }

  return (
    <div
      ref={lane}
      className={styles.lane}
      style={{ width, height: LANE_HEIGHT }}
      data-testid="velocity-lane"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => finish(true)}
      onPointerCancel={() => finish(false)}
    >
      {(draft ?? notes).map((note) => (
        <div
          key={note.id}
          className={`${styles.velocityBar} ${selected.has(note.id) ? styles.velocitySelected : ''}`}
          data-velocity={note.velocity.toFixed(2)}
          style={{ left: note.start * pixelsPerBeat, top: barTop(note.velocity), bottom: 0 }}
        />
      ))}
    </div>
  )
}
