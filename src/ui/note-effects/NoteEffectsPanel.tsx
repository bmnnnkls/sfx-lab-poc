import { useProjectStore, useSelectionStore } from '@state'
import { ChainEditor } from './ChainEditor'
import styles from './NoteEffects.module.css'

/**
 * The "Notes" tab: the selected instrument track's MIDI effect chain. Notes flow left to right from the
 * clip, through each effect, into the instrument; below, a piano roll shows what the instrument will hear.
 */
export const NoteEffectsPanel = () => {
  const tracks = useProjectStore((state) => state.project.tracks)
  const selectedId = useSelectionStore((state) => state.trackId)

  const track =
    tracks.find((candidate) => candidate.id === selectedId) ?? tracks.find((candidate) => candidate.kind === 'instrument')
  if (!track) return <p className={styles.empty}>Add an instrument track to give it MIDI effects.</p>
  if (track.kind === 'audio') {
    return (
      <p className={styles.empty}>
        “{track.name}” is an audio track, so it has no notes to process. Select an instrument track to edit its MIDI
        effects.
      </p>
    )
  }
  return <ChainEditor key={track.id} track={track} />
}
