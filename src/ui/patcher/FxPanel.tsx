import { findGroup } from '@core'
import { runAction, useProjectStore, useSelectionStore } from '@state'
import { useActionContext } from '../shared/menu'
import { GraphEditor } from './GraphEditor'
import styles from './Patcher.module.css'

/**
 * The "Effects" tab: the selected track's insert graph, a selected group's bus's, or the master bus's when the Master is
 * selected. A track's sound enters at Track in (a return's at Return in, a bus's at Group in, the master's at Master
 * in), goes through whatever is wired up, and leaves at Track out. Works the same for every kind of track.
 */
export const FxPanel = () => {
  const tracks = useProjectStore((state) => state.project.tracks)
  const selectedId = useSelectionStore((state) => state.trackId)
  const master = useSelectionStore((state) => state.master)
  const groupId = useSelectionStore((state) => state.groupId)
  const group = useProjectStore((state) => (groupId === null ? undefined : findGroup(state.project, groupId)))
  const addTrack = useProjectStore((state) => state.addTrack)
  const addAudioTrack = useProjectStore((state) => state.addAudioTrack)
  const context = useActionContext()

  if (master) return <GraphEditor key="master" owner="master" graph="fx" />
  if (group?.bus) return <GraphEditor key={group.id} owner={{ ...group, bus: group.bus }} graph="fx" />
  if (group) {
    return (
      <div className={styles.empty}>
        <p>“{group.name}” is a folder: its tracks go on to the next bus out, or the master. Sum them into a bus to give them effects of their own.</p>
        <button onClick={() => runAction('group.bus', { kind: 'group', groupId: group.id }, context)}>Sum to a bus</button>
      </div>
    )
  }
  const track = tracks.find((candidate) => candidate.id === selectedId) ?? tracks[0]
  if (!track) {
    return (
      <div className={styles.empty}>
        <p>There is no track to give effects.</p>
        <div className={styles.emptyActions}>
          <button onClick={addTrack}>Add instrument track</button>
          <button onClick={addAudioTrack}>Add audio track</button>
        </div>
      </div>
    )
  }
  return <GraphEditor key={track.id} owner={track} graph="fx" />
}
