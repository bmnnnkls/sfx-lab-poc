import { useEngineControls, useProjectStore } from '@state'
import { useMemo } from 'react'
import { PopupMenu } from '../shared/menu'
import { ClipSlot } from './ClipSlot'
import styles from './SessionView.module.css'
import { TrackHeader } from './TrackHeader'
import { sessionOrder } from './track-order'

/** The clip-launcher grid: tracks as columns, scenes as rows. */
export const SessionView = () => {
  const controls = useEngineControls()
  const projectTracks = useProjectStore((state) => state.project.tracks)
  const tracks = useMemo(() => sessionOrder(projectTracks), [projectTracks])
  const sceneCount = useProjectStore((state) => state.project.sceneCount)
  const addTrack = useProjectStore((state) => state.addTrack)
  const addAudioTrack = useProjectStore((state) => state.addAudioTrack)
  const addReturnTrack = useProjectStore((state) => state.addReturnTrack)

  const columns = `repeat(${tracks.length}, minmax(150px, 1fr)) 56px`

  return (
    <div className={styles.grid} style={{ gridTemplateColumns: columns }}>
      {tracks.map((track) => (
        <TrackHeader key={track.id} track={track} />
      ))}
      <PopupMenu
        entries={[
          { label: 'Instrument track', onSelect: addTrack },
          { label: 'Audio track', onSelect: addAudioTrack },
          { label: 'Return track', onSelect: addReturnTrack },
        ]}
      >
        <button className={styles.addTrack} aria-label="Add track">
          +
        </button>
      </PopupMenu>

      {Array.from({ length: sceneCount }, (_, scene) => (
        <SceneRow key={scene} scene={scene} onLaunch={() => controls.launchScene(scene)} />
      ))}
    </div>
  )
}

const SceneRow = ({ scene, onLaunch }: { scene: number; onLaunch: () => void }) => {
  const projectTracks = useProjectStore((state) => state.project.tracks)
  const tracks = useMemo(() => sessionOrder(projectTracks), [projectTracks])
  return (
    <>
      {tracks.map((track) => (
        <ClipSlot key={track.id} track={track} scene={scene} />
      ))}
      <button className={styles.scene} onClick={onLaunch} aria-label={`Launch scene ${scene + 1}`}>
        ▶ {scene + 1}
      </button>
    </>
  )
}
