import { useProjectStore, useSelectionStore } from '@state'
import { useState } from 'react'
import styles from './ClipEditor.module.css'
import { PianoRoll } from './PianoRoll'

const STEPS = [
  { label: '1/16', beats: 0.25 },
  { label: '1/8', beats: 0.5 },
  { label: '1/4', beats: 1 },
] as const

export const ClipEditor = () => {
  const trackId = useSelectionStore((state) => state.trackId)
  const clipId = useSelectionStore((state) => state.clipId)
  const track = useProjectStore((state) => state.project.tracks.find((t) => t.id === trackId))
  const setClipNotes = useProjectStore((state) => state.setClipNotes)
  const [step, setStep] = useState<number>(0.5)

  const clip = track?.clips.find((candidate) => candidate?.id === clipId)
  if (!track || !clip) return <p className={styles.empty}>Select a clip with ✎ to edit its notes.</p>

  return (
    <div className={styles.editor}>
      <div className={styles.toolbar}>
        <strong>
          {track.name} / {clip.name}
        </strong>
        <label>
          Grid{' '}
          <select value={step} onChange={(event) => setStep(Number(event.target.value))}>
            {STEPS.map((option) => (
              <option key={option.label} value={option.beats}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <span className={styles.hint}>Click a cell to add or remove a note</span>
      </div>
      <PianoRoll
        trackId={track.id}
        clipId={clip.id}
        lengthBeats={clip.lengthBeats}
        notes={clip.notes}
        step={step}
        onChange={(notes) => setClipNotes(track.id, clip.id, notes)}
      />
    </div>
  )
}
