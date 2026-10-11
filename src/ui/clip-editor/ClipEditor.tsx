import { MAX_CLIP_BEATS } from '@core'
import { useProjectStore, useSelectionStore } from '@state'
import { useState } from 'react'
import styles from './ClipEditor.module.css'
import { LengthField } from './LengthField'
import { PianoRoll } from './PianoRoll'
import { DEFAULT_ZOOM, GRID_OPTIONS, MAX_ZOOM, MIN_ZOOM } from './piano-roll-geometry'

export const ClipEditor = () => {
  const trackId = useSelectionStore((state) => state.trackId)
  const clipId = useSelectionStore((state) => state.clipId)
  const track = useProjectStore((state) => state.project.tracks.find((t) => t.id === trackId))
  const setClipNotes = useProjectStore((state) => state.setClipNotes)
  const setClipLength = useProjectStore((state) => state.setClipLength)
  const doubleClip = useProjectStore((state) => state.doubleClip)
  const [step, setStep] = useState<number>(0.5)
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)

  const clip = track?.clips.find((candidate) => candidate?.id === clipId)
  if (!track || !clip) return <p className={styles.empty}>Select a clip with ✎ to edit its notes.</p>

  return (
    <div className={styles.editor}>
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
        <button
          onClick={() => doubleClip(track.id, clip.id)}
          disabled={clip.lengthBeats * 2 > MAX_CLIP_BEATS}
          title="Double the length and repeat the notes into the new half"
        >
          Double
        </button>
        <span className={styles.hint}>
          Drag to draw · drag a note to move · drag its ends to resize · Del removes · Shift-click selects more
        </span>
      </div>
      <PianoRoll
        trackId={track.id}
        clipId={clip.id}
        lengthBeats={clip.lengthBeats}
        notes={clip.notes}
        step={step}
        pixelsPerBeat={zoom}
        onZoom={setZoom}
        onChange={(notes) => setClipNotes(track.id, clip.id, notes)}
      />
    </div>
  )
}
