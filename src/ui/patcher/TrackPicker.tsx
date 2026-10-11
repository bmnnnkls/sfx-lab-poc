import { tappableTracks } from '@core'
import { useProjectStore } from '@state'
import { TRACK_PICKER_HEIGHT } from './geometry'
import styles from './Patcher.module.css'

interface TrackPickerProps {
  /** The track whose note graph this is: it cannot take notes from itself, or from a track that takes notes from it. */
  ownerTrackId: string
  trackId: string | undefined
  onChange(trackId: string | null): void
}

/** Chooses which other track a Track notes node takes its notes from. */
export const TrackPicker = ({ ownerTrackId, trackId, onChange }: TrackPickerProps) => {
  const project = useProjectStore((state) => state.project)
  const choices = tappableTracks(project, ownerTrackId)
  const current = trackId ? project.tracks.find((track) => track.id === trackId) : undefined

  return (
    <div className={styles.trackPicker} style={{ height: TRACK_PICKER_HEIGHT }}>
      <select value={trackId ?? ''} aria-label="Take notes from track" onChange={(event) => onChange(event.target.value || null)}>
        <option value="">{choices.length === 0 ? '(no other instrument track)' : '(choose a track)'}</option>
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
