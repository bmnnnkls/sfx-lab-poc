import type { Clip } from '@core'
import { useEngineControls, useProjectStore, useSelectionStore, useStatusStore } from '@state'
import styles from './SessionView.module.css'

interface ClipSlotProps {
  trackId: string
  scene: number
  clip: Clip | null
}

export const ClipSlot = ({ trackId, scene, clip }: ClipSlotProps) => {
  const controls = useEngineControls()
  const createClip = useProjectStore((state) => state.createClip)
  const deleteClip = useProjectStore((state) => state.deleteClip)
  const selectClip = useSelectionStore((state) => state.selectClip)
  const playing = useStatusStore(
    (state) => !!clip && state.status?.tracks[trackId]?.playingClipId === clip.id,
  )
  const queued = useStatusStore(
    (state) => !!clip && state.status?.tracks[trackId]?.queued === clip.id,
  )

  if (!clip) {
    return (
      <div className={`${styles.slot} ${styles.empty}`}>
        <button onClick={() => selectClip(trackId, createClip(trackId, scene).id)} aria-label="Create clip">
          +
        </button>
      </div>
    )
  }

  const state = playing ? styles.playing : queued ? styles.queued : ''
  return (
    <div className={`${styles.slot} ${state}`}>
      <button className={styles.launch} onClick={() => controls.launchClip(trackId, clip.id)}>
        {playing ? '■' : '▶'} {clip.name}
      </button>
      <button onClick={() => selectClip(trackId, clip.id)} aria-label={`Edit ${clip.name}`}>
        ✎
      </button>
      <button onClick={() => deleteClip(trackId, scene)} aria-label={`Delete ${clip.name}`}>
        ×
      </button>
    </div>
  )
}
