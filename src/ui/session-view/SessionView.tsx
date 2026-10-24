import { useEngineControls, useProjectStore } from '@state'
import { type CSSProperties, useMemo } from 'react'
import { PopupMenu } from '../shared/menu'
import { AutomationSlotCell } from './AutomationSlotCell'
import { ClipSlot } from './ClipSlot'
import { MasterHeader } from './MasterHeader'
import styles from './SessionView.module.css'
import { TrackHeader } from './TrackHeader'
import { sessionOrder } from './track-order'

/**
 * The clip-launcher grid: tracks as columns, scenes as rows. It scrolls in its own scroller, under track headers that
 * stay at the top and a scene column that stays at the right, so tracks can be named and scenes launched anywhere.
 */
export const SessionView = () => {
  const controls = useEngineControls()
  const projectTracks = useProjectStore((state) => state.project.tracks)
  const tracks = useMemo(() => sessionOrder(projectTracks), [projectTracks])
  const sceneCount = useProjectStore((state) => state.project.sceneCount)
  const addTrack = useProjectStore((state) => state.addTrack)
  const addAudioTrack = useProjectStore((state) => state.addAudioTrack)
  const addReturnTrack = useProjectStore((state) => state.addReturnTrack)

  // The tracks, then the master, then the scenes; `--track-min` narrows the tracks in a narrow view.
  const columns = `repeat(var(--columns), minmax(var(--track-min), 1fr)) 56px`

  return (
    <div className={styles.scroller} data-scroll="both">
      <div className={styles.grid} style={{ gridTemplateColumns: columns, '--columns': tracks.length + 1 } as CSSProperties}>
        {tracks.map((track) => (
          <TrackHeader key={track.id} track={track} />
        ))}
        <MasterHeader />
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
    </div>
  )
}

const SceneRow = ({ scene, onLaunch }: { scene: number; onLaunch: () => void }) => {
  const projectTracks = useProjectStore((state) => state.project.tracks)
  const tracks = useMemo(() => sessionOrder(projectTracks), [projectTracks])
  const name = useProjectStore((state) => state.project.sceneNames?.[scene])
  return (
    <>
      {tracks.map((track) => (
        <ClipSlot key={track.id} track={track} scene={scene} />
      ))}
      <AutomationSlotCell owner={{ kind: 'master' }} scene={scene} />
      <button className={styles.scene} onClick={onLaunch} aria-label={name ? `Launch scene ${scene + 1}, ${name}` : `Launch scene ${scene + 1}`} title={name || undefined}>
        <span>▶ {scene + 1}</span>
        {name && <small className={styles.sceneName}>{name}</small>}
      </button>
    </>
  )
}
