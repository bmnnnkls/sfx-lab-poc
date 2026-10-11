import type { Note } from '@core'
import { useEffect, useRef } from 'react'
import { ContextMenu, type MenuEntry } from '../shared/context-menu'
import { shortcut } from '../shared/shortcut-labels'
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
import { useNoteClipboard } from './use-note-clipboard'
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
  /** Selected note ids; owned by the editor so its toolbar can act on them too. */
  selected: ReadonlySet<string>
  onSelect(ids: ReadonlySet<string>): void
  /** Groove tools offered in the context menu and on Q. Omit to hide them. */
  groove?: { quantize(): void; humanize(): void }
}

const ROWS = HIGH_PITCH - LOW_PITCH + 1

/**
 * Note editor. Click-drag on empty space draws a note as long as the drag; Ctrl/Cmd-drag selects a
 * box of notes; drag a note to move it, its ends to resize it. Shift-click multi-selects; Delete,
 * arrows, Ctrl+A/C/X/V/D work on the selection; double-click or right-click deletes a note; Ctrl+wheel
 * zooms. Right-click opens a context menu. The lane underneath sets velocities.
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
  selected,
  onSelect,
  groove,
}: PianoRollProps) => {
  const scroller = useRef<HTMLDivElement>(null)
  const { surface, visibleNotes, marquee, commands, handlers } = usePianoRollInteraction({
    notes,
    lengthBeats,
    step,
    pixelsPerBeat,
    selected,
    onSelect,
    onCommit: onChange,
    onAudition,
    onQuantize: groove?.quantize,
  })

  // Open each clip scrolled to where its notes are, not the top of the keyboard.
  const initialNotes = useRef(notes)
  initialNotes.current = notes
  const laneHeight = showVelocity ? LANE_HEIGHT : 0
  const laneHeightRef = useRef(laneHeight)
  laneHeightRef.current = laneHeight
  useEffect(() => {
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

  const clipboard = useNoteClipboard()
  const hasSelection = selected.size > 0
  const scope = hasSelection ? 'selection' : 'clip'
  const menu: MenuEntry[] = [
    { label: 'Copy', shortcut: shortcut('C'), disabled: !hasSelection, onSelect: commands.copy },
    { label: 'Cut', shortcut: shortcut('X'), disabled: !hasSelection, onSelect: commands.cut },
    { label: 'Paste', shortcut: shortcut('V'), disabled: clipboard.length === 0, onSelect: commands.paste },
    { label: 'Duplicate', shortcut: shortcut('D'), disabled: !hasSelection, onSelect: commands.duplicate },
    { label: 'Delete', shortcut: 'Del', danger: true, disabled: !hasSelection, onSelect: commands.remove },
    { kind: 'separator' },
    { label: 'Select all', shortcut: shortcut('A'), disabled: notes.length === 0, onSelect: commands.selectAll },
    ...(groove
      ? ([
          { kind: 'separator' },
          { label: `Quantize ${scope}`, shortcut: 'Q', disabled: notes.length === 0, onSelect: groove.quantize },
          { label: `Humanize ${scope}`, disabled: notes.length === 0, onSelect: groove.humanize },
        ] satisfies MenuEntry[])
      : []),
  ]

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

        <ContextMenu entries={menu}>
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
        </ContextMenu>

        {showVelocity && (
          <>
            <div className={styles.laneLabel}>Velocity</div>
            <VelocityLane
              notes={visibleNotes}
              selected={selected}
              width={width}
              pixelsPerBeat={pixelsPerBeat}
              onSelect={onSelect}
              onCommit={onChange}
            />
          </>
        )}
      </div>
    </div>
  )
}
