import type { AudioClip } from '@core'
import { type SubjectOf, runAction, useProjectStore, useStatusStore } from '@state'
import { useDragSource, useDropTarget } from '../shared/drag'
import { Icon } from '../shared/icon'
import { ActionMenu, type MenuEntry, PopupMenu, useActionContext } from '../shared/menu'
import { InPlaceRename, useRenaming } from '../shared/RenameField'
import { WaveformThumb } from '../shared/WaveformThumb'
import styles from './SessionView.module.css'

interface AudioClipSlotProps {
  trackId: string
  scene: number
  clip: AudioClip | null
}

/** A session-grid cell on an audio track: launches a sample clip, or (when empty) offers to add one. */
export const AudioClipSlot = ({ trackId, scene, clip }: AudioClipSlotProps) => {
  const context = useActionContext()
  const samples = useProjectStore((state) => state.project.samples)
  const playing = useStatusStore((state) => !!clip && state.status?.tracks[trackId]?.playingClipId === clip.id)
  const queued = useStatusStore((state) => !!clip && state.status?.tracks[trackId]?.queued === clip.id)
  const slot: SubjectOf<'slot'> = { kind: 'slot', trackId, scene }
  const subject: SubjectOf<'clip'> | null = clip && { kind: 'clip', trackId, clipId: clip.id }
  // A filled slot is a target too, so it shows that it refuses.
  const drop = useDropTarget(slot)
  const drag = useDragSource(useRenaming(subject ?? slot) ? null : subject)

  if (!clip || !subject) {
    // The same choices as the right-click menu's *Add audio clip* ▸.
    const add = (choice: string) => () => runAction('slot.add-audio-clip', slot, context, { choice })
    const choices: MenuEntry[] =
      samples.length === 0
        ? [{ label: 'Import samples…', onSelect: add('') }]
        : samples.map((sample) => ({ label: sample.name, onSelect: add(sample.id) }))
    return (
      <ActionMenu subject={slot}>
        <div className={`${styles.slot} ${styles.empty}`} {...drop}>
          <PopupMenu entries={choices}>
            <button aria-label="Add audio clip" title="Add an audio clip from the sample library">
              +
            </button>
          </PopupMenu>
        </div>
      </ActionMenu>
    )
  }

  const state = playing ? styles.playing : queued ? styles.queued : ''
  return (
    <ActionMenu subject={subject}>
      <div className={`${styles.slot} ${state}`} {...drop} {...drag}>
        <InPlaceRename subject={subject} name={clip.name} label={`Name of ${clip.name}`} className={styles.launch}>
          <button className={`${styles.launch} ${styles.audioLaunch}`} onClick={() => runAction('clip.launch', subject, context)} aria-label={`${playing ? 'Stop' : 'Play'} ${clip.name}`}>
            <Icon name={playing ? 'stop' : 'play'} filled size={12} />
            <span className={styles.slotName}>{clip.name}</span>
            <WaveformThumb sampleId={clip.sampleId} width={44} height={16} />
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
