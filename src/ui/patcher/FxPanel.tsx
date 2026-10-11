import { useProjectStore, useSelectionStore } from '@state'
import { GraphEditor } from './GraphEditor'
import styles from './Patcher.module.css'

/**
 * The "Effects" tab: the selected track's insert graph, or the master bus's when the Master is selected. A track's
 * sound enters at Track in (a return's at Return in, the master's at Master in), goes through whatever is wired up, and
 * leaves at Track out. Works the same for every kind of track.
 */
export const FxPanel = () => {
  const tracks = useProjectStore((state) => state.project.tracks)
  const selectedId = useSelectionStore((state) => state.trackId)
  const master = useSelectionStore((state) => state.master)

  if (master) return <GraphEditor key="master" owner="master" graph="fx" />
  const track = tracks.find((candidate) => candidate.id === selectedId) ?? tracks[0]
  if (!track) return <p className={styles.empty}>Add a track to give it effects.</p>
  return <GraphEditor key={track.id} owner={track} graph="fx" />
}
