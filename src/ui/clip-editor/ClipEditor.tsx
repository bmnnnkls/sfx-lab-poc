import { automationSlotsOf, resizeAutomation, type ControlOwner } from '@core'
import { editAutomationSlot, useAutomationEditor, useProjectStore, useSelectionStore } from '@state'
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

  const master = useSelectionStore((s) => s.master)
  const scene = useSelectionStore((s) => s.automationScene)
  const project = useProjectStore((s) => s.project)
  if (master || track?.kind === 'return') {
    const owner: ControlOwner = master ? { kind: 'master' } : { kind: 'track', trackId: track!.id }
    const slot = automationSlotsOf(project, owner)?.[scene]
    if (slot) return <div className={styles.view}><div className={styles.slotSettings} role="group" aria-label="Automation slot settings"><label>Loop beats <input key={`${slot.id}:${slot.lengthBeats}`} aria-label="Automation loop beats" type="number" min={0.25} max={256} step={0.25} defaultValue={slot.lengthBeats} onBlur={(e) => { const length = Number(e.target.value); editAutomationSlot(owner, scene, { ...resizeAutomation(slot, length), lengthBeats: length }) }} /></label><span>Scene {scene + 1} · automation only</span><button onClick={() => editAutomationSlot(owner, scene, null)}>Delete slot</button></div><AutomationEditor key={slot.id} owner={owner} track={{ id: master ? '' : track!.id, name: master ? 'Master' : track!.name }} clip={slot} /></div>
    return <p className={styles.empty}>Empty automation slot: launching this scene restores this owner's base values. Create a slot in the session grid.</p>
  }
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
