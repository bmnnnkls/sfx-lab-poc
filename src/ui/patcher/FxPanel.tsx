import { useProjectStore, useSelectionStore } from '@state'
import { GraphEditor } from './GraphEditor'
import styles from './Patcher.module.css'

/**
 * The "Effects" tab: the selected track's insert graph. The track's sound enters at Track in, goes through whatever
 * is wired up, and leaves at Track out on its way to the fader. Works the same for instrument and audio tracks.
 */
export const FxPanel = () => {
  const tracks = useProjectStore((state) => state.project.tracks)
  const selectedId = useSelectionStore((state) => state.trackId)

  const track = tracks.find((candidate) => candidate.id === selectedId) ?? tracks[0]
  if (!track) return <p className={styles.empty}>Add a track to give it effects.</p>
  return <GraphEditor key={track.id} track={track} graph="fx" />
}
