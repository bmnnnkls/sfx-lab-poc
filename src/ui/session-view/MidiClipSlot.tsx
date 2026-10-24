import type { Clip } from '@core'
import { type Subject, runAction, useStatusStore } from '@state'
import { ActionMenu, useActionContext } from '../shared/menu'
import styles from './SessionView.module.css'

interface ClipSlotProps {
  trackId: string
  scene: number
  clip: Clip | null
}

export const MidiClipSlot = ({ trackId, scene, clip }: ClipSlotProps) => {
  const context = useActionContext()
  const playing = useStatusStore(
    (state) => !!clip && state.status?.tracks[trackId]?.playingClipId === clip.id,
  )
  const queued = useStatusStore(
    (state) => !!clip && state.status?.tracks[trackId]?.queued === clip.id,
  )

  if (!clip) {
    const slot: Subject = { kind: 'slot', trackId, scene }
    return (
      <ActionMenu subject={slot}>
        <div className={`${styles.slot} ${styles.empty}`}>
          <button onClick={() => runAction('slot.create-clip', slot, context)} aria-label="Create clip">
            +
          </button>
        </div>
      </ActionMenu>
    )
  }

  const subject: Subject = { kind: 'clip', trackId, clipId: clip.id }
  const state = playing ? styles.playing : queued ? styles.queued : ''
  return (
    <ActionMenu subject={subject}>
      <div className={`${styles.slot} ${state}`} >
        <button className={styles.launch} onClick={() => runAction('clip.launch', subject, context)}>
          {playing ? '■' : '▶'} {clip.name}
        </button>
        <button onClick={() => runAction('clip.edit', subject, context)} aria-label={`Edit ${clip.name}`}>
          ✎
        </button>
        <button onClick={() => runAction('clip.delete', subject, context)} aria-label={`Delete ${clip.name}`}>
          ×
        </button>
      </div>
    </ActionMenu>
  )
}
