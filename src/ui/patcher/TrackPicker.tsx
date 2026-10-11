import { sendableReturns, tappableTracks } from '@core'
import { useProjectStore } from '@state'
import { TRACK_PICKER_HEIGHT } from './geometry'
import styles from './Patcher.module.css'

interface TrackPickerProps {
  /** `notes`: another instrument track to take notes from. `return`: a return track to send to. */
  pick: 'notes' | 'return'
  /** The track whose graph this is: it cannot point at itself, or at a track that points back at it. */
  ownerTrackId: string
  trackId: string | undefined
  onChange(trackId: string | null): void
}

const TEXT = {
  notes: { label: 'Take notes from track', none: '(no other instrument track)' },
  return: { label: 'Send to return track', none: '(no return track: add one with +)' },
} as const

/** Chooses which other track a Track notes node takes its notes from, or which return track a Send sends to. */
export const TrackPicker = ({ pick, ownerTrackId, trackId, onChange }: TrackPickerProps) => {
  const project = useProjectStore((state) => state.project)
  const choices = pick === 'notes' ? tappableTracks(project, ownerTrackId) : sendableReturns(project, ownerTrackId)
  const current = trackId ? project.tracks.find((track) => track.id === trackId) : undefined

  return (
    <div className={styles.trackPicker} style={{ height: TRACK_PICKER_HEIGHT }}>
      <select value={trackId ?? ''} aria-label={TEXT[pick].label} onChange={(event) => onChange(event.target.value || null)}>
        <option value="">{choices.length === 0 ? TEXT[pick].none : '(choose a track)'}</option>
        {/* Keep showing the current choice even if it has become unavailable. */}
        {current && !choices.some((choice) => choice.id === current.id) && <option value={current.id}>{current.name}</option>}
        {choices.map((track) => (
          <option key={track.id} value={track.id}>
            {track.name}
          </option>
        ))}
      </select>
    </div>
  )
}
