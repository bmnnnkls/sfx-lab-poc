import type { AudioClip } from '@core'
import { useEngineControls, useProjectStore, useSelectionStore, useStatusStore } from '@state'
import { ContextMenu, type MenuEntry, PopupMenu } from '../shared/menu'
import { WaveformThumb } from '../shared/WaveformThumb'
import styles from './SessionView.module.css'

interface AudioClipSlotProps {
  trackId: string
  scene: number
  clip: AudioClip | null
}

/** A session-grid cell on an audio track: launches a sample clip, or (when empty) offers to add one. */
export const AudioClipSlot = ({ trackId, scene, clip }: AudioClipSlotProps) => {
  const controls = useEngineControls()
  const samples = useProjectStore((state) => state.project.samples)
  const createAudioClip = useProjectStore((state) => state.createAudioClip)
  const deleteClip = useProjectStore((state) => state.deleteAudioClip)
  const selectClip = useSelectionStore((state) => state.selectClip)
  const playing = useStatusStore((state) => !!clip && state.status?.tracks[trackId]?.playingClipId === clip.id)
  const queued = useStatusStore((state) => !!clip && state.status?.tracks[trackId]?.queued === clip.id)

  if (!clip) {
    const choices: MenuEntry[] =
      samples.length === 0
        ? [{ label: 'No samples yet: import some in the Samples tab', disabled: true, onSelect: () => {} }]
        : samples.map((sample) => ({
            label: sample.name,
            onSelect: () => {
              createAudioClip(trackId, scene, sample)
              const track = useProjectStore.getState().project.tracks.find((candidate) => candidate.id === trackId)
              const added = track?.kind === 'audio' ? track.clips[scene] : null
              if (added) selectClip(trackId, added.id)
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

  const state = playing ? styles.playing : queued ? styles.queued : ''
  return (
    <ContextMenu
      entries={[
        { label: playing ? 'Restart clip' : 'Launch clip', onSelect: () => controls.launchClip(trackId, clip.id) },
        { label: 'Edit clip', onSelect: () => selectClip(trackId, clip.id) },
        { kind: 'separator' },
        { label: 'Delete clip', danger: true, onSelect: () => deleteClip(trackId, scene) },
      ]}
    >
      <div className={`${styles.slot} ${state}`}>
        <button className={`${styles.launch} ${styles.audioLaunch}`} onClick={() => controls.launchClip(trackId, clip.id)}>
          <span>{playing ? '■' : '▶'}</span>
          <span className={styles.slotName}>{clip.name}</span>
          <WaveformThumb sampleId={clip.sampleId} width={44} height={16} />
        </button>
        <button onClick={() => selectClip(trackId, clip.id)} aria-label={`Edit ${clip.name}`}>
          ✎
        </button>
        <button onClick={() => deleteClip(trackId, scene)} aria-label={`Delete ${clip.name}`}>
          ×
        </button>
      </div>
    </ContextMenu>
  )
}
