import {
  type Clip,
  type InstrumentTrack,
  MAX_CLIP_BEATS,
  type Note,
  humanizeNotes,
  quantizeNotes,
  swingNotes,
} from '@core'
import { useEngineControls, useProjectStore } from '@state'
import { useState } from 'react'
import { useStoredState } from '../shared/use-stored-state'
import styles from './ClipEditor.module.css'
import { DEFAULT_GROOVE, isGrooveSettings } from './groove-settings'
import { GroovePanel } from './GroovePanel'
import { LengthField } from './LengthField'
import { PianoRoll } from './PianoRoll'
import { DEFAULT_ZOOM, GRID_OPTIONS, MAX_ZOOM, MIN_ZOOM, clampZoom } from './piano-roll-geometry'

const isGridStep = (value: unknown): value is number =>
  typeof value === 'number' && GRID_OPTIONS.some((option) => option.beats === value)
const isZoom = (value: unknown): value is number => typeof value === 'number' && clampZoom(value) === value
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'

const HINT = 'Drag: draw · Ctrl-drag: select box · drag note / ends: move / resize · double-click or right-click · Q quantize'

/**
 * The note editor for one MIDI clip. Mounted with `key={clip.id}`, so its selection resets when the clip
 * changes without any effect.
 */
export const MidiClipEditor = ({ track, clip }: { track: InstrumentTrack; clip: Clip }) => {
  const controls = useEngineControls()
  const setClipNotes = useProjectStore((state) => state.setClipNotes)
  const setClipLength = useProjectStore((state) => state.setClipLength)
  const doubleClip = useProjectStore((state) => state.doubleClip)

  // Editor preferences are remembered between sessions.
  const [step, setStep] = useStoredState('sfxlab:roll-grid', 0.5, isGridStep)
  const [zoom, setZoom] = useStoredState('sfxlab:roll-zoom', DEFAULT_ZOOM, isZoom)
  const [audition, setAudition] = useStoredState('sfxlab:roll-audition', true, isBoolean)
  const [follow, setFollow] = useStoredState('sfxlab:roll-follow', true, isBoolean)
  const [showVelocity, setShowVelocity] = useStoredState('sfxlab:roll-velocity', true, isBoolean)

  const [groove, setGroove] = useStoredState('sfxlab:groove', DEFAULT_GROOVE, isGrooveSettings)

  // Selected notes are owned here so the toolbar's groove tools act on the same selection as the roll.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())

  /** Applies a groove tool to the selection, or the whole clip when nothing is selected. */
  const applyGroove = (tool: (notes: readonly Note[], ids: ReadonlySet<string>) => Note[]) => {
    const ids = selected.size > 0 ? selected : new Set(clip.notes.map((note) => note.id))
    setClipNotes(track.id, clip.id, tool(clip.notes, ids))
  }
  const quantize = () =>
    applyGroove((notes, ids) =>
      quantizeNotes(notes, ids, { step, strength: groove.strength, ends: groove.ends }, clip.lengthBeats),
    )
  const swing = () => applyGroove((notes, ids) => swingNotes(notes, ids, step, groove.swing, clip.lengthBeats))
  const humanize = () =>
    applyGroove((notes, ids) =>
      humanizeNotes(notes, ids, { step, timing: groove.humanizeTiming, velocity: groove.humanizeVelocity }, clip.lengthBeats),
    )

  return (
    <div className={styles.editor} data-clip-editor>
      <div className={styles.toolbar}>
        <strong>
          {track.name} / {clip.name}
        </strong>
        <label className={styles.field}>
          Grid
          <select value={step} onChange={(event) => setStep(Number(event.target.value))}>
            {GRID_OPTIONS.map((option) => (
              <option key={option.label} value={option.beats}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Zoom
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            value={zoom}
            aria-label="Zoom"
            onChange={(event) => setZoom(Number(event.target.value))}
          />
        </label>
        <LengthField
          lengthBeats={clip.lengthBeats}
          onCommit={(beats) => setClipLength(track.id, clip.id, beats)}
        />
        <GroovePanel
          settings={groove}
          onSettings={setGroove}
          scope={selected.size > 0 ? 'selection' : 'clip'}
          onQuantize={quantize}
          onSwing={swing}
          onHumanize={humanize}
        />
        <button
          onClick={() => doubleClip(track.id, clip.id)}
          disabled={clip.lengthBeats * 2 > MAX_CLIP_BEATS}
          title="Double the length and repeat the notes into the new half"
        >
          Double
        </button>
        <label className={styles.field} title="Play each note through the track's instrument as you place or change it">
          <input type="checkbox" checked={audition} onChange={(event) => setAudition(event.target.checked)} />
          Audition
        </label>
        <label className={styles.field} title="Scroll along with the playhead while the clip plays">
          <input type="checkbox" checked={follow} onChange={(event) => setFollow(event.target.checked)} />
          Follow
        </label>
        <label className={styles.field} title="Show the velocity lane under the roll">
          <input type="checkbox" checked={showVelocity} onChange={(event) => setShowVelocity(event.target.checked)} />
          Velocity
        </label>
        <span className={styles.help} title={HINT}>
          {HINT}
        </span>
      </div>
      <PianoRoll
        trackId={track.id}
        clipId={clip.id}
        lengthBeats={clip.lengthBeats}
        notes={clip.notes}
        step={step}
        pixelsPerBeat={zoom}
        follow={follow}
        showVelocity={showVelocity}
        selected={selected}
        onSelect={setSelected}
        groove={{ quantize, humanize }}
        onZoom={setZoom}
        onChange={(notes) => setClipNotes(track.id, clip.id, notes)}
        onAudition={audition ? (pitch, velocity) => controls.auditionNote(track.id, pitch, velocity) : undefined}
      />
    </div>
  )
}
