import { type AudioTrack, type InstrumentTrack, automationSlotsOf, isAudioContent, regionClipRef, resizeAutomation, type ControlOwner } from '@core'
import { editAutomationSlot, openClip, useAutomationEditor, useLayoutStore, useProjectStore, useSelectionStore } from '@state'
import { AutomationEditor } from '../automation/AutomationEditor'
import { AudioClipEditor } from '../audio-clip-editor/AudioClipEditor'
import { viewTitles } from '../layout/view-titles'
import styles from './ClipEditor.module.css'
import { MidiClipEditor } from './MidiClipEditor'

const BEATS_PER_BAR = 4

/**
 * The "Clip" tab: opens whichever editor fits the selected clip (piano roll for MIDI, waveform for audio). A selected
 * region comes first: its own copy is edited, not its session source.
 */
export const ClipEditor = () => {
  const automation = useAutomationEditor((state) => state.visible)
  const trackId = useSelectionStore((state) => state.trackId)
  const clipId = useSelectionStore((state) => state.clipId)
  const regionId = useSelectionStore((state) => state.regionId)
  const track = useProjectStore((state) => state.project.tracks.find((candidate) => candidate.id === trackId))
  const region = useProjectStore((state) => state.project.arrangement?.find((candidate) => candidate.id === regionId))
  const regionTrack = useProjectStore((state) => state.project.tracks.find((candidate) => candidate.id === region?.trackId))

  const master = useSelectionStore((s) => s.master)
  const scene = useSelectionStore((s) => s.automationScene)
  const project = useProjectStore((s) => s.project)

  // No automation and no playhead for a region yet: the timeline plays neither (round 12).
  if (region) {
    const where = `arrangement, bar ${Math.floor(region.startBeat / BEATS_PER_BAR) + 1}`
    const content = region.content
    if (regionTrack?.kind === 'instrument' && !isAudioContent(content)) return <div className={styles.view}><MidiClipEditor key={region.id} track={regionTrack} clip={content} clipRef={regionClipRef(region.id)} where={where} /></div>
    if (regionTrack?.kind === 'audio' && isAudioContent(content)) return <div className={styles.view}><AudioClipEditor key={region.id} track={regionTrack} clip={content} clipRef={regionClipRef(region.id)} where={where} /></div>
  }

  if (master || track?.kind === 'return') {
    const owner: ControlOwner = master ? { kind: 'master' } : { kind: 'track', trackId: track!.id }
    const slot = automationSlotsOf(project, owner)?.[scene]
    if (slot) return <div className={styles.view}><div className={styles.slotSettings} role="group" aria-label="Automation slot settings"><label>Loop beats <input key={`${slot.id}:${slot.lengthBeats}`} aria-label="Automation loop beats" type="number" min={0.25} max={256} step={0.25} defaultValue={slot.lengthBeats} onBlur={(e) => { const length = Number(e.target.value); editAutomationSlot(owner, scene, { ...resizeAutomation(slot, length), lengthBeats: length }) }} /></label><span>Scene {scene + 1} · automation only</span><button onClick={() => editAutomationSlot(owner, scene, null)}>Delete slot</button></div><AutomationEditor key={slot.id} owner={owner} track={{ id: master ? '' : track!.id, name: master ? 'Master' : track!.name }} clip={slot} /></div>
    return <div className={styles.empty}><p>Empty automation slot: launching this scene restores this owner's base values.</p><button onClick={() => editAutomationSlot(owner, scene, { id: crypto.randomUUID(), name: 'Automation', lengthBeats: 4 })}>Create slot</button></div>
  }
  if (track?.kind === 'instrument') {
    const clip = track.clips.find((candidate) => candidate?.id === clipId)
    if (clip) return <div className={styles.view}><EditorView automation={automation} />{automation ? <AutomationEditor key={clip.id} track={track} clip={clip} /> : <MidiClipEditor key={clip.id} track={track} clip={clip} />}</div>
  }
  if (track?.kind === 'audio') {
    const clip = track.clips.find((candidate) => candidate?.id === clipId)
    if (clip) return <div className={styles.view}><EditorView automation={automation} />{automation ? <AutomationEditor key={clip.id} track={track} clip={clip} /> : <AudioClipEditor key={clip.id} track={track} clip={clip} />}</div>
  }
  return <NoClip track={track} />
}

/** Nothing to edit: offer the selected track's clips, a new clip on an instrument track, and the session grid. */
const NoClip = ({ track }: { track: InstrumentTrack | AudioTrack | undefined }) => {
  const createClip = useProjectStore((state) => state.createClip)
  const clips = track?.clips.filter((clip) => clip !== null) ?? []
  const free = track?.clips.findIndex((clip) => clip === null) ?? -1
  return <div className={styles.empty}>
    <p>{track ? `No clip of “${track.name}” is selected.` : 'No clip is selected.'}</p>
    {track && (clips.length > 0 || track.kind === 'instrument') && <div className={styles.actions} role="group" aria-label={`Clips of ${track.name}`}>
      {clips.map((clip) => <button key={clip.id} onClick={() => openClip(track.id, clip.id)}>{clip.name}</button>)}
      {track.kind === 'instrument' && <button disabled={free < 0} title={free < 0 ? 'Every scene already has a clip on this track' : undefined} onClick={() => openClip(track.id, createClip(track.id, free).id)}>Create clip</button>}
    </div>}
    <button onClick={() => useLayoutStore.getState().revealView('session')}>Show {viewTitles.session.toLowerCase()}</button>
  </div>
}

const EditorView = ({ automation }: { automation: boolean }) => <div role="group" aria-label="Clip view"><button aria-pressed={!automation} onClick={() => useAutomationEditor.getState().hide()}>Notes / waveform</button><button aria-pressed={automation} onClick={() => useAutomationEditor.getState().show()}>Automation</button></div>
