import type { Clip } from '@core'
import { type SubjectOf, runAction, useStatusStore } from '@state'
import { useDragSource, useDropTarget } from '../shared/drag'
import { ActionMenu, useActionContext } from '../shared/menu'
import { InPlaceRename, useRenaming } from '../shared/RenameField'
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
  const slot: SubjectOf<'slot'> = { kind: 'slot', trackId, scene }
  const subject: SubjectOf<'clip'> | null = clip && { kind: 'clip', trackId, clipId: clip.id }
  // A filled slot is a target too, so it shows that it refuses.
  const drop = useDropTarget(slot)
  const drag = useDragSource(useRenaming(subject ?? slot) ? null : subject)

  if (!clip || !subject) {
    return (
      <ActionMenu subject={slot}>
        <div className={`${styles.slot} ${styles.empty}`} {...drop}>
          <button onClick={() => runAction('slot.create-clip', slot, context)} aria-label="Create clip">
            +
          </button>
        </div>
      </ActionMenu>
    )
  }

  const state = playing ? styles.playing : queued ? styles.queued : ''
  return (
    <ActionMenu subject={subject}>
      <div className={`${styles.slot} ${state}`} {...drop} {...drag}>
        <InPlaceRename subject={subject} name={clip.name} label={`Name of ${clip.name}`} className={styles.launch}>
          <button className={styles.launch} onClick={() => runAction('clip.launch', subject, context)}>
            {playing ? '■' : '▶'} {clip.name}
          </button>
        </InPlaceRename>
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
