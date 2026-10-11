import { type HeardNote, type InstrumentTrack, heardNotes } from '@core'
import { useSelectionStore } from '@state'
import { useMemo, useState } from 'react'
import styles from './NoteEffects.module.css'

const WIDTH = 920
const LABEL_WIDTH = 34
const ROW = 6

const noteName = (pitch: number): string => `C${Math.floor(pitch / 12) - 1}`

/** One piano-roll lane: notes as bars over a beat grid. */
const Lane = ({ notes, beats, low, high, className, title }: {
  notes: readonly HeardNote[]
  beats: number
  low: number
  high: number
  className: string
  title: string
}) => {
  const rows = high - low + 1
  const height = Math.max(70, rows * ROW)
  const rowHeight = height / rows
  const x = (beat: number) => LABEL_WIDTH + (beat / beats) * (WIDTH - LABEL_WIDTH)
  return (
    <svg viewBox={`0 0 ${WIDTH} ${height}`} className={styles.lane} role="img" aria-label={title} data-testid={`lane-${className}`}>
      {Array.from({ length: Math.ceil(beats) + 1 }, (_, beat) => (
        <line key={beat} x1={x(beat)} x2={x(beat)} y1={0} y2={height} className={beat % 4 === 0 ? styles.bar : styles.beat} />
      ))}
      {Array.from({ length: rows }, (_, row) => low + row)
        .filter((pitch) => pitch % 12 === 0)
        .map((pitch) => (
          <text key={pitch} x={LABEL_WIDTH - 4} y={(high - pitch + 0.7) * rowHeight} textAnchor="end" className={styles.pitchLabel}>
            {noteName(pitch)}
          </text>
        ))}
      {notes.map((note, index) => (
        <rect
          key={index}
          className={className === 'out' ? styles.noteOut : styles.noteIn}
          x={x(note.start) + 0.5}
          y={(high - note.pitch) * rowHeight + 0.5}
          width={Math.max(2, x(note.start + note.duration) - x(note.start) - 1)}
          height={Math.max(3, rowHeight - 1)}
          opacity={0.45 + note.velocity * 0.55}
          data-testid={`note-${className}`}
        />
      ))}
    </svg>
  )
}

/** Shows a clip as written and as the instrument will hear it after the chain. Uses the engine's own code. */
export const HeardNotes = ({ track }: { track: InstrumentTrack }) => {
  const selectedClipId = useSelectionStore((state) => state.clipId)
  const withNotes = track.clips.flatMap((clip) => (clip && clip.notes.length > 0 ? [clip] : []))
  const [chosen, setChosen] = useState<string | null>(null)
  const clip =
    withNotes.find((candidate) => candidate.id === chosen) ??
    withNotes.find((candidate) => candidate.id === selectedClipId) ??
    withNotes[0]

  const view = useMemo(() => {
    if (!clip) return null
    const input = heardNotes(clip, [])
    const output = heardNotes(clip, track.noteEffects)
    const pitches = [...input, ...output].map((note) => note.pitch)
    return { input, output, low: Math.min(...pitches) - 1, high: Math.max(...pitches) + 1, beats: clip.lengthBeats }
  }, [clip, track.noteEffects])

  if (!clip || !view) {
    return <p className={styles.hint}>Add notes to one of this track’s clips to see what the instrument will hear.</p>
  }

  return (
    <section className={styles.heard} aria-label="What the instrument hears">
      <header className={styles.heardHeader}>
        <h3>What the instrument hears</h3>
        <label className={styles.clipPicker}>
          Clip
          <select value={clip.id} onChange={(event) => setChosen(event.target.value)} aria-label="Preview clip">
            {withNotes.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </label>
        <span className={styles.legend}>
          <i className={styles.swatchIn} /> clip notes <i className={styles.swatchOut} /> after the chain
        </span>
        <span className={styles.count} data-testid="heard-count">
          {view.input.length} in, {view.output.length} out
        </span>
      </header>
      <Lane notes={view.input} beats={view.beats} low={view.low} high={view.high} className="in" title="Notes in the clip" />
      <Lane notes={view.output} beats={view.beats} low={view.low} high={view.high} className="out" title="Notes after the MIDI effects" />
    </section>
  )
}
