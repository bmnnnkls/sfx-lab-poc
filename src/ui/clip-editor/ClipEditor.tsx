import { useAutomationEditor, useProjectStore, useSelectionStore } from '@state'
import { AutomationEditor } from '../automation/AutomationEditor'
import { AudioClipEditor } from '../audio-clip-editor/AudioClipEditor'
import styles from './ClipEditor.module.css'
import { MidiClipEditor } from './MidiClipEditor'

/** The "Clip" tab: opens whichever editor fits the selected clip (piano roll for MIDI, waveform for audio). */
export const ClipEditor = () => {
  const automation = useAutomationEditor((state) => state.visible)
  const trackId = useSelectionStore((state) => state.trackId)
  const clipId = useSelectionStore((state) => state.clipId)
  const track = useProjectStore((state) => state.project.tracks.find((candidate) => candidate.id === trackId))

  if (track?.kind === 'instrument') {
    const clip = track.clips.find((candidate) => candidate?.id === clipId)
    if (clip) return <div className={styles.view}><EditorView automation={automation} />{automation ? <AutomationEditor key={clip.id} track={track} clip={clip} /> : <MidiClipEditor key={clip.id} track={track} clip={clip} />}</div>
  }
  if (track?.kind === 'audio') {
    const clip = track.clips.find((candidate) => candidate?.id === clipId)
    if (clip) return <div className={styles.view}><EditorView automation={automation} />{automation ? <AutomationEditor key={clip.id} track={track} clip={clip} /> : <AudioClipEditor key={clip.id} track={track} clip={clip} />}</div>
  }
  return <p className={styles.empty}>Select a clip with ✎ to edit it.</p>
}

const EditorView = ({ automation }: { automation: boolean }) => <div role="group" aria-label="Clip view"><button aria-pressed={!automation} onClick={() => useAutomationEditor.getState().hide()}>Notes / waveform</button><button aria-pressed={automation} onClick={() => useAutomationEditor.getState().show()}>Automation</button></div>
