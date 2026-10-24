import type { Clip } from '@core'
import { duplicateSessionClip, useAutomationEditor, useEngineControls, openClip, useProjectStore, useStatusStore } from '@state'
import { ContextMenu } from '../shared/menu'
import { placeOnArrangement } from './place-on-arrangement'
import styles from './SessionView.module.css'

interface ClipSlotProps {
  trackId: string
  scene: number
  clip: Clip | null
}

export const MidiClipSlot = ({ trackId, scene, clip }: ClipSlotProps) => {
  const controls = useEngineControls()
  const createClip = useProjectStore((state) => state.createClip)
  const deleteClip = useProjectStore((state) => state.deleteClip)
  const playing = useStatusStore(
    (state) => !!clip && state.status?.tracks[trackId]?.playingClipId === clip.id,
  )
  const queued = useStatusStore(
    (state) => !!clip && state.status?.tracks[trackId]?.queued === clip.id,
  )

  if (!clip) {
    const create = () => openClip(trackId, createClip(trackId, scene).id)
    return (
      <ContextMenu entries={[{ label: 'Create clip', onSelect: create }]}>
        <div className={`${styles.slot} ${styles.empty}`}>
          <button onClick={create} aria-label="Create clip">
            +
          </button>
        </div>
      </ContextMenu>
    )
  }

  const state = playing ? styles.playing : queued ? styles.queued : ''
  return (
    <ContextMenu
      entries={[
        { label: playing ? 'Restart clip' : 'Launch clip', onSelect: () => controls.launchClip(trackId, clip.id) },
        { label: 'Edit notes', onSelect: () => openClip(trackId, clip.id) },
        { label: 'Edit automation', onSelect: () => { openClip(trackId, clip.id); useAutomationEditor.getState().show() } },
        { label: 'Duplicate to empty slot', disabled: !useProjectStore.getState().project.tracks.some((t) => t.id === trackId && t.kind !== 'return' && t.clips.some((c) => !c)), onSelect: () => duplicateSessionClip(trackId, clip.id) },
        { label: 'Place on arrangement', onSelect: () => placeOnArrangement(trackId, clip) },
        { kind: 'separator' },
        { label: 'Delete clip', danger: true, onSelect: () => deleteClip(trackId, scene) },
      ]}
    >
      <div className={`${styles.slot} ${state}`} >
        <button className={styles.launch} onClick={() => controls.launchClip(trackId, clip.id)}>
          {playing ? '■' : '▶'} {clip.name}
        </button>
        <button onClick={() => openClip(trackId, clip.id)} aria-label={`Edit ${clip.name}`}>
          ✎
        </button>
        <button onClick={() => deleteClip(trackId, scene)} aria-label={`Delete ${clip.name}`}>
          ×
        </button>
      </div>
    </ContextMenu>
  )
}
