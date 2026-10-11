import {
  addNode,
  connect,
  createNode,
  disconnect,
  moveNode,
  removeNode,
  setNodeParam,
  setNodeSample,
} from '@core'
import { useProjectStore, useSelectionStore } from '@state'
import { NodePalette } from './NodePalette'
import { PatchCanvas } from './PatchCanvas'
import styles from './Patcher.module.css'

const SPAWN_OFFSET = { x: 40, y: 330 }
const VOICE_OPTIONS = [1, 2, 3, 4, 6, 8, 12, 16]

/** Node-based editor for the selected track's instrument patch. */
export const Patcher = () => {
  const tracks = useProjectStore((state) => state.project.tracks)
  const selectedId = useSelectionStore((state) => state.trackId)
  const updatePatch = useProjectStore((state) => state.updatePatch)
  const setTrackVoices = useProjectStore((state) => state.setTrackVoices)

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

  const edit = (change: Parameters<typeof updatePatch>[1], mergeKey?: string) =>
    updatePatch(track.id, change, mergeKey)

  return (
    <div className={styles.patcher}>
      <div className={styles.toolbar}>
        <strong>{track.name}</strong>
        <label className={styles.voices} title="Maximum simultaneous notes for this instrument">
          Voices
          <select
            value={track.voices}
            onChange={(event) => setTrackVoices(track.id, Number(event.target.value))}
          >
            {VOICE_OPTIONS.map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </label>
        <NodePalette
          onAdd={(type) =>
            edit((patch) =>
              addNode(patch, createNode(type, SPAWN_OFFSET.x + patch.nodes.length * 12, SPAWN_OFFSET.y)),
            )
          }
        />
      </div>
      <PatchCanvas
        patch={track.patch}
        onMoveNode={(id, x, y) => edit((patch) => moveNode(patch, id, x, y), `move:${track.id}:${id}`)}
        onRemoveNode={(id) => edit((patch) => removeNode(patch, id))}
        onParamChange={(id, paramId, value) =>
          edit((patch) => setNodeParam(patch, id, paramId, value), `param:${track.id}:${id}:${paramId}`)
        }
        onSampleChange={(id, sampleId) => edit((patch) => setNodeSample(patch, id, sampleId))}
        onConnect={(from, to) => edit((patch) => connect(patch, from, to))}
        onDisconnect={(id) => edit((patch) => disconnect(patch, id))}
      />
    </div>
  )
}
