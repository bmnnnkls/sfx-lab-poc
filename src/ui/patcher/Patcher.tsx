import { useProjectStore, useSelectionStore } from '@state'
import { GraphEditor } from './GraphEditor'
import styles from './Patcher.module.css'

/** Node-based editor for the selected track's instrument patch. */
export const Patcher = () => {
  const tracks = useProjectStore((state) => state.project.tracks)
  const selectedId = useSelectionStore((state) => state.trackId)

  // Fall back to the first instrument track when nothing (or an audio track) is selected.
  const track =
    tracks.find((candidate) => candidate.id === selectedId) ?? tracks.find((candidate) => candidate.kind === 'instrument')
  if (!track) return <p className={styles.empty}>Add an instrument track to edit its instrument.</p>
  if (track.kind === 'audio') {
    return (
      <p className={styles.empty}>
        “{track.name}” is an audio track: it plays samples directly and has no instrument. Select an instrument
        track to edit its patch, or open one of this track’s clips to edit it.
      </p>
    )
  }
  return <GraphEditor key={track.id} track={track} graph="patch" />
}
