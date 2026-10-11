import { useEngineControls, useProjectStore } from '@state'
import { ClipSlot } from './ClipSlot'
import styles from './SessionView.module.css'
import { TrackHeader } from './TrackHeader'

/** The clip-launcher grid: tracks as columns, scenes as rows. */
export const SessionView = () => {
  const controls = useEngineControls()
  const tracks = useProjectStore((state) => state.project.tracks)
  const sceneCount = useProjectStore((state) => state.project.sceneCount)
  const addTrack = useProjectStore((state) => state.addTrack)

  const columns = `repeat(${tracks.length}, minmax(150px, 1fr)) 56px`

  return (
    <div className={styles.grid} style={{ gridTemplateColumns: columns }}>
      {tracks.map((track) => (
        <TrackHeader key={track.id} track={track} />
      ))}
      <button className={styles.addTrack} onClick={addTrack} aria-label="Add track">
        +
      </button>

      {Array.from({ length: sceneCount }, (_, scene) => (
        <SceneRow key={scene} scene={scene} onLaunch={() => controls.launchScene(scene)} />
      ))}
    </div>
  )
}

const SceneRow = ({ scene, onLaunch }: { scene: number; onLaunch: () => void }) => {
  const tracks = useProjectStore((state) => state.project.tracks)
  return (
    <>
      {tracks.map((track) => (
        <ClipSlot key={track.id} trackId={track.id} scene={scene} clip={track.clips[scene] ?? null} />
      ))}
      <button className={styles.scene} onClick={onLaunch} aria-label={`Launch scene ${scene + 1}`}>
        ▶ {scene + 1}
      </button>
    </>
  )
}
