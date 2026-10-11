import type { Note } from '@core'
import { ROW_HEIGHT, rowOfPitch } from './piano-roll-geometry'
import styles from './PianoRoll.module.css'

interface NoteViewProps {
  note: Note
  pixelsPerBeat: number
  selected: boolean
}

const MAX_HANDLE = 6

/**
 * One note. Its body drags to move it; the thin handles on each end drag to resize.
 * All pointer handling lives on the surface (see `usePianoRollInteraction`), which finds
 * the note and part through these data attributes.
 */
export const NoteView = ({ note, pixelsPerBeat, selected }: NoteViewProps) => {
  const width = Math.max(4, note.duration * pixelsPerBeat - 1)
  const handle = Math.min(MAX_HANDLE, width / 3)

  return (
    <div
      className={`${styles.note} ${selected ? styles.selected : ''}`}
      data-note-id={note.id}
      data-pitch={note.pitch}
      style={{
        left: note.start * pixelsPerBeat,
        top: rowOfPitch(note.pitch) * ROW_HEIGHT,
        width,
        height: ROW_HEIGHT - 1,
        opacity: 0.55 + 0.45 * note.velocity,
      }}
    >
      <span className={styles.handle} data-part="start" style={{ left: 0, width: handle }} />
      <span className={styles.handle} data-part="end" style={{ right: 0, width: handle }} />
    </div>
  )
}
