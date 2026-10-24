import type { AudioClip } from '@core'
import { type Subject, runAction, useProjectStore, useStatusStore } from '@state'
import { ActionMenu, type MenuEntry, PopupMenu, useActionContext } from '../shared/menu'
import { InPlaceRename } from '../shared/RenameField'
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

  if (!clip) {
    const slot: Subject = { kind: 'slot', trackId, scene }
    // The same choices as the right-click menu's *Add audio clip* ▸.
    const add = (choice: string) => () => runAction('slot.add-audio-clip', slot, context, { choice })
    const choices: MenuEntry[] =
      samples.length === 0
        ? [{ label: 'Import samples…', onSelect: add('') }]
        : samples.map((sample) => ({ label: sample.name, onSelect: add(sample.id) }))
    return (
      <ActionMenu subject={slot}>
        <div className={`${styles.slot} ${styles.empty}`}>
          <PopupMenu entries={choices}>
            <button aria-label="Add audio clip" title="Add an audio clip from the sample library">
              +
            </button>
          </PopupMenu>
        </div>
      </ActionMenu>
    )
  }

  const subject: Subject = { kind: 'clip', trackId, clipId: clip.id }
  const state = playing ? styles.playing : queued ? styles.queued : ''
  return (
    <ActionMenu subject={subject}>
      <div className={`${styles.slot} ${state}`}>
        <InPlaceRename subject={subject} name={clip.name} label={`Name of ${clip.name}`} className={styles.launch}>
          <button className={`${styles.launch} ${styles.audioLaunch}`} onClick={() => runAction('clip.launch', subject, context)}>
            <span>{playing ? '■' : '▶'}</span>
            <span className={styles.slotName}>{clip.name}</span>
            <WaveformThumb sampleId={clip.sampleId} width={44} height={16} />
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
