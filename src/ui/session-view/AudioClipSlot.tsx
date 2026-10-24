import type { AudioClip } from '@core'
import { type Subject, openClip, runAction, useLayoutStore, useProjectStore, useStatusStore } from '@state'
import { ActionMenu, type MenuEntry, PopupMenu, useActionContext } from '../shared/menu'
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
  const createAudioClip = useProjectStore((state) => state.createAudioClip)
  const playing = useStatusStore((state) => !!clip && state.status?.tracks[trackId]?.playingClipId === clip.id)
  const queued = useStatusStore((state) => !!clip && state.status?.tracks[trackId]?.queued === clip.id)

  if (!clip) {
    const choices: MenuEntry[] =
      samples.length === 0
        ? [{ label: 'Import samples…', onSelect: () => useLayoutStore.getState().revealView('samples') }]
        : samples.map((sample) => ({
            label: sample.name,
            onSelect: () => {
              createAudioClip(trackId, scene, sample)
              const track = useProjectStore.getState().project.tracks.find((candidate) => candidate.id === trackId)
              const added = track?.kind === 'audio' ? track.clips[scene] : null
              if (added) openClip(trackId, added.id)
            },
          }))
    return (
      <div className={`${styles.slot} ${styles.empty}`}>
        <PopupMenu entries={choices}>
          <button aria-label="Add audio clip" title="Add an audio clip from the sample library">
            +
          </button>
        </PopupMenu>
      </div>
    )
  }

  const subject: Subject = { kind: 'clip', trackId, clipId: clip.id }
  const state = playing ? styles.playing : queued ? styles.queued : ''
  return (
    <ActionMenu subject={subject}>
      <div className={`${styles.slot} ${state}`}>
        <button className={`${styles.launch} ${styles.audioLaunch}`} onClick={() => runAction('clip.launch', subject, context)}>
          <span>{playing ? '■' : '▶'}</span>
          <span className={styles.slotName}>{clip.name}</span>
          <WaveformThumb sampleId={clip.sampleId} width={44} height={16} />
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
