import { openMasterEffects, openTrackView, useProjectStore, useSelectionStore } from '@state'
import { viewTitles } from '../layout/view-titles'
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
  const master = useSelectionStore((state) => state.master)
  const addTrack = useProjectStore((state) => state.addTrack)

  if (master) return <Empty text="The master bus has no notes to process." action={{ label: OPEN_EFFECTS, run: openMasterEffects }} />

  const track =
    tracks.find((candidate) => candidate.id === selectedId) ?? tracks.find((candidate) => candidate.kind === 'instrument')
  if (!track) return <Empty text="There is no instrument track to give a note graph." action={{ label: 'Add instrument track', run: addTrack }} />
  if (track.kind === 'return' || track.kind === 'audio') {
    // What such a track has instead: effects on its sound.
    const text = track.kind === 'return'
      ? `“${track.name}” is a return track, so it has no notes to process.`
      : `“${track.name}” is an audio track, so it has no notes to process. Select an instrument track to edit its notes.`
    return <Empty text={text} action={{ label: OPEN_EFFECTS, run: () => openTrackView(track.id, 'effects') }} />
  }
  return <GraphEditor key={track.id} owner={track} graph="notes" aside={<HeardNotes track={track} />} />
}

const OPEN_EFFECTS = `Open ${viewTitles.effects.toLowerCase()}`

/** Why there is no note graph here, and the action that gets one or shows what there is instead. */
const Empty = ({ text, action }: { text: string; action: { label: string; run: () => void } }) => (
  <div className={styles.empty}>
    <p>{text}</p>
    <div className={styles.emptyActions}>
      <button onClick={action.run}>{action.label}</button>
    </div>
  </div>
)
