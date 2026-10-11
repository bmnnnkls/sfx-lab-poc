import type { Note } from '@core'
import { useStatusStore } from '@state'
import { useEffect, useRef, useState } from 'react'
import { NoteView } from './NoteView'
import { PianoKeys } from './PianoKeys'
import {
  KEY_WIDTH,
  RULER_HEIGHT,
  ROW_HEIGHT,
  HIGH_PITCH,
  LOW_PITCH,
  centerPitch,
  clampZoom,
  isBlackKey,
  pitchRows,
  scrollTopFor,
} from './piano-roll-geometry'
import styles from './PianoRoll.module.css'
import { Ruler } from './Ruler'
import { usePianoRollInteraction } from './use-piano-roll-interaction'

interface PianoRollProps {
  trackId: string
  clipId: string
  lengthBeats: number
  notes: readonly Note[]
  /** Grid snap in beats. */
  step: number
  pixelsPerBeat: number
  onZoom(pixelsPerBeat: number): void
  onChange(notes: readonly Note[]): void
}

const ROWS = HIGH_PITCH - LOW_PITCH + 1

/**
 * Note editor. Click-drag on empty space draws a note as long as the drag; drag a note to move it,
 * its ends to resize it. Shift-click multi-selects; Delete, arrow keys, Ctrl+A and Ctrl+D work on
 * the selection; double-click or right-click a note to delete it; Ctrl+wheel zooms.
 */
export const PianoRoll = ({
  trackId,
  clipId,
  lengthBeats,
  notes,
  step,
  pixelsPerBeat,
  onZoom,
  onChange,
}: PianoRollProps) => {
  const scroller = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const { surface, visibleNotes, handlers } = usePianoRollInteraction({
    notes,
    lengthBeats,
    step,
    pixelsPerBeat,
    selected,
    onSelect: setSelected,
    onCommit: onChange,
  })

  const playheadBeat = useStatusStore((state) => {
    const launcher = state.status?.tracks[trackId]
    if (!state.status || launcher?.playingClipId !== clipId || launcher.startBeat === null) return null
    return (state.status.beat - launcher.startBeat) % lengthBeats
  })

  // Open each clip scrolled to where its notes are, not the top of the keyboard.
  const initialNotes = useRef(notes)
  initialNotes.current = notes
  useEffect(() => {
    setSelected(new Set())
    const element = scroller.current
    if (element) element.scrollTop = scrollTopFor(centerPitch(initialNotes.current), element.clientHeight)
  }, [clipId])

  // Ctrl/Cmd + wheel zooms. Needs a non-passive listener to stop the browser zooming the page instead.
  const zoomRef = useRef({ pixelsPerBeat, onZoom })
  zoomRef.current = { pixelsPerBeat, onZoom }
  useEffect(() => {
    const element = scroller.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const { pixelsPerBeat: current, onZoom: zoom } = zoomRef.current
      zoom(clampZoom(current * (event.deltaY < 0 ? 1.12 : 1 / 1.12)))
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])

  const width = lengthBeats * pixelsPerBeat
  const gridLines = {
    '--bar': `${pixelsPerBeat * 4}px`,
    '--beat': `${pixelsPerBeat}px`,
    '--step': `${pixelsPerBeat * step}px`,
  } as React.CSSProperties

  return (
    <div ref={scroller} className={styles.scroller}>
      <div className={styles.layout} style={{ gridTemplateColumns: `${KEY_WIDTH}px ${width}px`, gridTemplateRows: `${RULER_HEIGHT}px ${ROWS * ROW_HEIGHT}px` }}>
        <div className={styles.corner} />
        <Ruler lengthBeats={lengthBeats} pixelsPerBeat={pixelsPerBeat} />
        <PianoKeys />

        <div
          ref={surface}
          className={styles.surface}
          style={{ width, height: ROWS * ROW_HEIGHT }}
          tabIndex={0}
          data-testid="note-surface"
          {...handlers}
        >
          <div className={styles.rows}>
            {pitchRows().map((pitch) => (
              <div
                key={pitch}
                className={`${styles.row} ${isBlackKey(pitch) ? styles.blackRow : ''} ${pitch % 12 === 0 ? styles.cRow : ''}`}
                style={{ height: ROW_HEIGHT }}
              />
            ))}
          </div>
          <div className={styles.gridLines} style={gridLines} />

          {visibleNotes.map((note) => (
            <NoteView key={note.id} note={note} pixelsPerBeat={pixelsPerBeat} selected={selected.has(note.id)} />
          ))}

          {playheadBeat !== null && (
            <div className={styles.playhead} style={{ left: playheadBeat * pixelsPerBeat }} />
          )}
        </div>
      </div>
    </div>
  )
}
