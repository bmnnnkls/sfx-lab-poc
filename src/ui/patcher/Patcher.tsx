import { addNode, connect, createNode, disconnect, moveNode, removeNode, setNodeParam } from '@core'
import { useProjectStore, useSelectionStore } from '@state'
import { NodePalette } from './NodePalette'
import { PatchCanvas } from './PatchCanvas'
import styles from './Patcher.module.css'

const SPAWN_OFFSET = { x: 40, y: 330 }

/** Node-based editor for the selected track's instrument patch. */
export const Patcher = () => {
  const tracks = useProjectStore((state) => state.project.tracks)
  const selectedId = useSelectionStore((state) => state.trackId)
  const updatePatch = useProjectStore((state) => state.updatePatch)

  const track = tracks.find((candidate) => candidate.id === selectedId) ?? tracks[0]
  if (!track) return <p className={styles.empty}>Add a track to edit its instrument.</p>

  const edit = (change: Parameters<typeof updatePatch>[1]) => updatePatch(track.id, change)

  return (
    <div className={styles.patcher}>
      <div className={styles.toolbar}>
        <strong>{track.name}</strong>
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
        onMoveNode={(id, x, y) => edit((patch) => moveNode(patch, id, x, y))}
        onRemoveNode={(id) => edit((patch) => removeNode(patch, id))}
        onParamChange={(id, paramId, value) => edit((patch) => setNodeParam(patch, id, paramId, value))}
        onConnect={(from, to) => edit((patch) => connect(patch, from, to))}
        onDisconnect={(id) => edit((patch) => disconnect(patch, id))}
      />
    </div>
  )
}
