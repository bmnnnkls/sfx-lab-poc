import { useProjectStore, useSelectionStore } from '@state'
import { GraphEditor } from '../patcher/GraphEditor'
import { HeardNotes } from './HeardNotes'
import styles from './NoteEffects.module.css'

/**
 * The "Notes" tab: the selected instrument track's note graph, between its clips and its instrument. Notes
 * flow left to right and can be split, processed on each branch, merged, and mixed with notes from other tracks.
 * Beside it, a piano roll shows what the instrument will hear.
 */
export const NoteEffectsPanel = () => {
  const tracks = useProjectStore((state) => state.project.tracks)
  const selectedId = useSelectionStore((state) => state.trackId)

  const track =
    tracks.find((candidate) => candidate.id === selectedId) ?? tracks.find((candidate) => candidate.kind === 'instrument')
  if (!track) return <p className={styles.empty}>Add an instrument track to give it a note graph.</p>
  if (track.kind === 'audio') {
    return (
      <p className={styles.empty}>
        “{track.name}” is an audio track, so it has no notes to process. Select an instrument track to edit its notes.
      </p>
    )
  }
  return <GraphEditor key={track.id} track={track} graph="notes" aside={<HeardNotes track={track} />} />
}
