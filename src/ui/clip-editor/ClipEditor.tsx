import { useProjectStore, useSelectionStore } from '@state'
import { AudioClipEditor } from '../audio-clip-editor/AudioClipEditor'
import styles from './ClipEditor.module.css'
import { MidiClipEditor } from './MidiClipEditor'

/** The "Clip" tab: opens whichever editor fits the selected clip (piano roll for MIDI, waveform for audio). */
export const ClipEditor = () => {
  const trackId = useSelectionStore((state) => state.trackId)
  const clipId = useSelectionStore((state) => state.clipId)
  const track = useProjectStore((state) => state.project.tracks.find((candidate) => candidate.id === trackId))

  if (track?.kind === 'instrument') {
    const clip = track.clips.find((candidate) => candidate?.id === clipId)
    if (clip) return <MidiClipEditor key={clip.id} track={track} clip={clip} />
  }
  if (track?.kind === 'audio') {
    const clip = track.clips.find((candidate) => candidate?.id === clipId)
    if (clip) return <AudioClipEditor key={clip.id} track={track} clip={clip} />
  }
  return <p className={styles.empty}>Select a clip with ✎ to edit it.</p>
}
