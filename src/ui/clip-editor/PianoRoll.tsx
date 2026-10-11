import type { Note } from '@core'
import { useStatusStore } from '@state'
import { useEffect, useRef } from 'react'
import {
  CELL_WIDTH,
  ROW_HEIGHT,
  centerPitch,
  isBlackKey,
  pitchName,
  pitchRows,
  scrollTopFor,
  toggleNote,
} from './piano-roll-geometry'
import styles from './PianoRoll.module.css'

interface PianoRollProps {
  trackId: string
  clipId: string
  lengthBeats: number
  notes: readonly Note[]
  /** Grid resolution in beats. */
  step: number
  onChange(notes: readonly Note[]): void
}

export const PianoRoll = ({ trackId, clipId, lengthBeats, notes, step, onChange }: PianoRollProps) => {
  const columns = Math.round(lengthBeats / step)
  const scroller = useRef<HTMLDivElement>(null)

  // Open each clip scrolled to where its notes are, not the top of the keyboard.
  const initialNotes = useRef(notes)
  initialNotes.current = notes
  useEffect(() => {
    const element = scroller.current
    if (element) element.scrollTop = scrollTopFor(centerPitch(initialNotes.current), element.clientHeight)
  }, [clipId])

  const playheadBeat = useStatusStore((state) => {
    const launcher = state.status?.tracks[trackId]
    if (!state.status || launcher?.playingClipId !== clipId || launcher.startBeat === null) return null
    return (state.status.beat - launcher.startBeat) % lengthBeats
  })

  return (
    <div ref={scroller} className={styles.scroller}>
      <div className={styles.roll} style={{ width: columns * CELL_WIDTH + 44 }}>
        {pitchRows().map((pitch) => (
          <div key={pitch} className={styles.row} style={{ height: ROW_HEIGHT }}>
            <span className={`${styles.key} ${isBlackKey(pitch) ? styles.black : ''}`}>
              {pitch % 12 === 0 ? pitchName(pitch) : ''}
            </span>
            {Array.from({ length: columns }, (_, column) => (
              <button
                key={column}
                aria-label={`${pitchName(pitch)} at beat ${column * step}`}
                className={`${styles.cell} ${isBlackKey(pitch) ? styles.blackRow : ''} ${
                  (column * step) % 1 === 0 ? styles.beat : ''
                }`}
                style={{ width: CELL_WIDTH }}
                onClick={() => onChange(toggleNote(notes, pitch, column * step, step))}
              />
            ))}
          </div>
        ))}

        {notes.map((note, index) => (
          <div
            key={index}
            className={styles.note}
            style={{
              left: 44 + (note.start / step) * CELL_WIDTH,
              width: (Math.min(note.duration, lengthBeats - note.start) / step) * CELL_WIDTH - 1,
              top: pitchRows().indexOf(note.pitch) * ROW_HEIGHT,
              height: ROW_HEIGHT - 1,
            }}
          />
        ))}

        {playheadBeat !== null && (
          <div
            className={styles.playhead}
            style={{ left: 44 + (playheadBeat / step) * CELL_WIDTH }}
          />
        )}
      </div>
    </div>
  )
}
