import type { Clip } from '@core'
import { type SubjectOf, runAction, useRecordStore, useStatusStore } from '@state'
import { useDragSource, useDropTarget } from '../shared/drag'
import { Icon } from '../shared/icon'
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
  const armed = useRecordStore((state) => state.armed.includes(trackId))
  const recorded = useRecordStore((state) => (clip && state.takes[trackId]?.clipId === clip.id ? state.takes[trackId] : undefined))
  // A take into a new clip draws the slot as recording; an overdub keeps it playing, with a red dot.
  const take = recorded?.kind === 'slot' ? recorded : undefined
  const overdub = recorded?.kind === 'overdub'
  const slot: SubjectOf<'slot'> = { kind: 'slot', trackId, scene }
  const subject: SubjectOf<'clip'> | null = clip && { kind: 'clip', trackId, clipId: clip.id }
  // A filled slot is a target too, so it shows that it refuses.
  const drop = useDropTarget(slot)
  const drag = useDragSource(useRenaming(subject ?? slot) ? null : subject)

  if (!clip || !subject) {
    // On an armed track, an empty slot records; *Create clip* stays in its menu.
    return (
      <ActionMenu subject={slot}>
        <div className={`${styles.slot} ${styles.empty} ${armed ? styles.recordEmpty : ''}`} {...drop}>
          {armed ? (
            <button onClick={() => runAction('slot.record', slot, context)} aria-label="Record a clip here" title="Record a clip here from the next bar">
              <Icon name="record" filled size={12} />
            </button>
          ) : (
            <button onClick={() => runAction('slot.create-clip', slot, context)} aria-label="Create clip">
              +
            </button>
          )}
        </div>
      </ActionMenu>
    )
  }

  if (take) {
    // Pressing a slot being recorded ends the take at the next bar.
    const ending = take.state === 'ending'
    return (
      <ActionMenu subject={subject}>
        <div className={`${styles.slot} ${styles.recording} ${take.state === 'queued' ? styles.recordQueued : ''}`} data-recording={take.state} {...drop}>
          <button
            className={styles.launch}
            onClick={() => runAction('clip.stop-recording', subject, context)}
            disabled={ending}
            aria-label={ending ? `${clip.name}: recording ends at the next bar` : `Stop recording ${clip.name}`}
            title={ending ? 'The take ends at the next bar' : 'Stop recording at the next bar'}
          >
            <Icon name="record" filled size={12} /> {clip.name}
          </button>
          <button onClick={() => runAction('clip.edit', subject, context)} aria-label={`Edit ${clip.name}`}>
            <Icon name="edit" size={12} />
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
          <button className={styles.launch} onClick={() => runAction('clip.launch', subject, context)} aria-label={`${playing ? 'Stop' : 'Play'} ${clip.name}`}>
            <Icon name={playing ? 'stop' : 'play'} filled size={12} /> {clip.name}
            {overdub && <span className={styles.overdubDot} title="Overdubbing: what you play is added to this clip"> <Icon name="record" filled size={12} label="overdubbing" /></span>}
          </button>
        </InPlaceRename>
        <button onClick={() => runAction('clip.edit', subject, context)} aria-label={`Edit ${clip.name}`}>
          <Icon name="edit" size={12} />
        </button>
        <button onClick={() => runAction('clip.delete', subject, context)} aria-label={`Delete ${clip.name}`}>
          <Icon name="close" size={12} />
        </button>
      </div>
    </ActionMenu>
  )
}
