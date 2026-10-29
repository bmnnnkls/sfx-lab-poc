import { findGroup } from '@core'
import { openClip, openGroupEffects, openMasterEffects, openTrackView, useLayoutStore, useProjectStore, useSelectionStore } from '@state'
import { viewTitles } from '../layout/view-titles'
import { GraphEditor } from './GraphEditor'
import styles from './Patcher.module.css'

const OPEN_EFFECTS = `Open ${viewTitles.effects.toLowerCase()}`

/** Node-based editor for the selected track's instrument patch. */
export const Patcher = () => {
  const tracks = useProjectStore((state) => state.project.tracks)
  const selectedId = useSelectionStore((state) => state.trackId)
  const master = useSelectionStore((state) => state.master)
  const groupId = useSelectionStore((state) => state.groupId)
  const group = useProjectStore((state) => (groupId === null ? undefined : findGroup(state.project, groupId)))
  const addTrack = useProjectStore((state) => state.addTrack)

  if (master) {
    return (
      <div className={styles.empty}>
        <p>The master bus has no instrument, only effects.</p>
        <button onClick={openMasterEffects}>{OPEN_EFFECTS}</button>
      </div>
    )
  }

  if (group) {
    return (
      <div className={styles.empty}>
        <p>“{group.name}” is a group: it has no instrument{group.bus ? ', only its bus\'s effects' : ''}.</p>
        {group.bus && <button onClick={() => openGroupEffects(group.id)}>{OPEN_EFFECTS}</button>}
      </div>
    )
  }

  // Fall back to the first instrument track when nothing (or an audio track) is selected.
  const track =
    tracks.find((candidate) => candidate.id === selectedId) ?? tracks.find((candidate) => candidate.kind === 'instrument')
  if (!track) {
    return (
      <div className={styles.empty}>
        <p>There is no instrument track to edit.</p>
        <div className={styles.emptyActions}>
          <button onClick={addTrack}>Add instrument track</button>
        </div>
      </div>
    )
  }
  if (track.kind === 'audio') {
    const clips = track.clips.filter((clip) => clip !== null)
    return (
      <div className={styles.empty}>
        <p>
          “{track.name}” is an audio track: it plays samples directly and has no instrument. Select an instrument
          track to edit its patch, or open one of this track’s clips.
        </p>
        <div className={styles.emptyActions} role="group" aria-label={`Clips of ${track.name}`}>
          {clips.map((clip) => <button key={clip.id} onClick={() => openClip(track.id, clip.id)}>{clip.name}</button>)}
          <button onClick={() => useLayoutStore.getState().revealView('session')}>Show {viewTitles.session.toLowerCase()}</button>
        </div>
      </div>
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
