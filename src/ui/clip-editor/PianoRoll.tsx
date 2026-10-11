import type { Note } from '@core'
import { useEffect, useRef, useState } from 'react'
import { NoteView } from './NoteView'
import { PianoKeys } from './PianoKeys'
import {
  HIGH_PITCH,
  KEY_WIDTH,
  LANE_HEIGHT,
  LOW_PITCH,
  ROW_HEIGHT,
  RULER_HEIGHT,
  centerPitch,
  clampZoom,
  scrollTopFor,
} from './piano-roll-geometry'
import styles from './PianoRoll.module.css'
import { Playhead } from './Playhead'
import { RowBackground } from './RowBackground'
import { Ruler } from './Ruler'
import { usePianoRollInteraction } from './use-piano-roll-interaction'
import { VelocityLane } from './VelocityLane'

interface PianoRollProps {
  trackId: string
  clipId: string
  lengthBeats: number
  notes: readonly Note[]
  /** Grid snap in beats. */
  step: number
  pixelsPerBeat: number
  /** Scroll along with the playhead. */
  follow: boolean
  /** Show the velocity lane under the roll. */
  showVelocity: boolean
  onZoom(pixelsPerBeat: number): void
  onChange(notes: readonly Note[]): void
  /** Hear a note while editing it; omit to stay silent. */
  onAudition?(pitch: number, velocity: number): void
}

const ROWS = HIGH_PITCH - LOW_PITCH + 1

/**
 * Note editor. Click-drag on empty space draws a note as long as the drag; Ctrl/Cmd-drag selects a
 * box of notes; drag a note to move it, its ends to resize it. Shift-click multi-selects; Delete,
 * arrows, Ctrl+A/C/X/V/D work on the selection; double-click or right-click deletes a note; Ctrl+wheel
 * zooms. The lane underneath sets velocities.
 */
export const PianoRoll = ({
  trackId,
  clipId,
  lengthBeats,
  notes,
  step,
  pixelsPerBeat,
  follow,
  showVelocity,
  onZoom,
  onChange,
  onAudition,
}: PianoRollProps) => {
  const scroller = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const { surface, visibleNotes, marquee, handlers } = usePianoRollInteraction({
    notes,
    lengthBeats,
    step,
    pixelsPerBeat,
    selected,
    onSelect: setSelected,
    onCommit: onChange,
    onAudition,
  })

  // Open each clip scrolled to where its notes are, not the top of the keyboard.
  const initialNotes = useRef(notes)
  initialNotes.current = notes
  const laneHeight = showVelocity ? LANE_HEIGHT : 0
  const laneHeightRef = useRef(laneHeight)
  laneHeightRef.current = laneHeight
  useEffect(() => {
    setSelected(new Set())
    const element = scroller.current
    if (element) {
      element.scrollTop = scrollTopFor(centerPitch(initialNotes.current), element.clientHeight, laneHeightRef.current)
    }
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
      <div
        className={styles.layout}
        style={{
          gridTemplateColumns: `${KEY_WIDTH}px ${width}px`,
          gridTemplateRows: `${RULER_HEIGHT}px ${ROWS * ROW_HEIGHT}px ${laneHeight}px`,
        }}
      >
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
          <RowBackground />
          <div className={styles.gridLines} style={gridLines} />

          {visibleNotes.map((note) => (
            <NoteView key={note.id} note={note} pixelsPerBeat={pixelsPerBeat} selected={selected.has(note.id)} />
          ))}

          {marquee && (
            <div
              className={styles.marquee}
              data-testid="marquee"
              style={{
                left: Math.min(marquee.x0, marquee.x1),
                top: Math.min(marquee.y0, marquee.y1),
                width: Math.abs(marquee.x1 - marquee.x0),
                height: Math.abs(marquee.y1 - marquee.y0),
              }}
            />
          )}

          <Playhead
            trackId={trackId}
            clipId={clipId}
            lengthBeats={lengthBeats}
            pixelsPerBeat={pixelsPerBeat}
            follow={follow}
            scroller={scroller}
          />
        </div>

        {showVelocity && (
          <>
            <div className={styles.laneLabel}>Velocity</div>
            <VelocityLane
              notes={visibleNotes}
              selected={selected}
              width={width}
              pixelsPerBeat={pixelsPerBeat}
              onSelect={setSelected}
              onCommit={onChange}
            />
          </>
        )}
      </div>
    </div>
  )
}
