import { openMasterEffects, openTrackView, useProjectStore, useSelectionStore } from '@state'
import { viewTitles } from '../layout/view-titles'
import { GraphEditor } from './GraphEditor'
import styles from './Patcher.module.css'

const OPEN_EFFECTS = `Open ${viewTitles.effects.toLowerCase()}`

/** Node-based editor for the selected track's instrument patch. */
export const Patcher = () => {
  const tracks = useProjectStore((state) => state.project.tracks)
  const selectedId = useSelectionStore((state) => state.trackId)
  const master = useSelectionStore((state) => state.master)

  if (master) {
    return (
      <div className={styles.empty}>
        <p>The master bus has no instrument, only effects.</p>
        <button onClick={openMasterEffects}>{OPEN_EFFECTS}</button>
      </div>
    )
  }

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
  if (track.kind === 'return') {
    return (
      <div className={styles.empty}>
        <p>“{track.name}” is a return track: it has no instrument. Other tracks send sound to it, through its effects.</p>
        <button onClick={() => openTrackView(track.id, 'effects')}>{OPEN_EFFECTS}</button>
      </div>
    )
  }
  return <GraphEditor key={track.id} owner={track} graph="patch" />
}
