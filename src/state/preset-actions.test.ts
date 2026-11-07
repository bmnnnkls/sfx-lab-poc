import { afterEach, describe, expect, it } from 'vitest'
import { type ControlTarget, type Snapshot, type InstrumentTrack, Engine, setGroupBus, timelineLanesOf, timelineLanesOpen, createNode, createEmptyProject, createClip, createReturnTrack, setAutomationSlot, captureSnapshot, putSnapshot, serializeProject, parseProject, automationPosition } from '@core'
import { recallSavedSound } from './preset-actions'
import { useProjectStore } from './project-store'
import { useControlStore } from './control-store'
import { useStatusStore } from './status-store'
import { useTouchStore, cancelTouches, setTouchClock } from './touch-store'
const volume: ControlTarget = { kind: 'mixer', owner: { kind: 'track', trackId: 't' }, control: 'volume' }
const pan: ControlTarget = { ...volume, control: 'pan' }
const setup = () => {
  const p = createEmptyProject(), t = p.tracks[0] as InstrumentTrack
  let project = { ...p, tracks: [{ ...t, id: 't', volume: 0.4, clips: [{ ...createClip('Clip', 4), id: 'clip', automation: [{ id: 'lane', target: volume, enabled: true, points: [{ id: 'p', beat: 0, value: 0.4, interpolation: 'linear' as const }, { id: 'q', beat: 3, value: 0.5, interpolation: 'linear' as const }] }] }] }, { ...createReturnTrack('Return'), id: 'r' }] }
  project = setAutomationSlot(project, { kind: 'master' }, 0, { id: 'master-slot', name: 'M', lengthBeats: 3 }) as typeof project
  project = setAutomationSlot(project, { kind: 'track', trackId: 'r' }, 0, { id: 'return-slot', name: 'R', lengthBeats: 2 }) as typeof project
  useProjectStore.getState().resetProject(project)
  const engine = new Engine(8000)
  // Compact actual status with three independently launched owner loops.
  const status = { ...engine.status(), playing: true, beat: 1, tracks: { t: { playingClipId: 'clip', startBeat: 0, queued: null }, r: { playingClipId: 'return-slot', startBeat: 0, queued: null } }, masterAutomation: { playingClipId: 'master-slot', startBeat: 0, queued: null } }
  useStatusStore.setState({ status }); setTouchClock(() => 1)
  useControlStore.setState({ playback: [{ target: volume, value: 0.6 }] })
  const sound: Snapshot = { id: 'sound', name: 'Sound', scope: { owner: volume.owner, domain: 'track' }, values: [{ target: volume, value: 0.9 }, { target: pan, value: -0.5 }] }
  return { project, sound }
}
afterEach(() => { cancelTouches(); setTouchClock(); useControlStore.getState().clear(); useStatusStore.setState({ status: null, audioFailure: null }) })
describe('sound recall history and Read/Touch', () => {
  it('recalls bases under Read without rewriting lanes, undoes once, and reloads either saved sound', () => {
    const { project, sound } = setup()
    const a = captureSnapshot(project, sound.scope, 'A')
    useProjectStore.getState().resetProject(putSnapshot(putSnapshot(project, a), sound))
    const before = useProjectStore.getState().project
    expect(recallSavedSound(sound)).toContain('controlled by Read')
    const after = useProjectStore.getState().project
    expect((after.tracks[0] as InstrumentTrack).volume).toBe(0.9)
    expect((after.tracks[0] as InstrumentTrack).clips).toBe((project.tracks[0] as InstrumentTrack).clips)
    expect(useProjectStore.getState().history.past).toHaveLength(1)
    useProjectStore.getState().undo(); expect(useProjectStore.getState().project).toBe(before)
    useProjectStore.getState().redo()
    const r = parseProject(serializeProject(useProjectStore.getState().project)); if (!r.ok) throw new Error(r.error)
    useProjectStore.getState().resetProject(r.project)
    recallSavedSound(r.project.snapshots![0]!); expect(useProjectStore.getState().project.tracks[0]?.volume).toBe(0.4)
    recallSavedSound(r.project.snapshots![1]!); expect(useProjectStore.getState().project.tracks[0]?.volume).toBe(0.9)
  })
  it('records all affected controls at exactly one beat as stepped events in the same undo step', () => {
    const { project, sound } = setup(); useTouchStore.getState().arm(true)
    recallSavedSound(sound)
    const p = useProjectStore.getState().project, lanes = (p.tracks[0] as InstrumentTrack).clips[0]!.automation!
    expect(lanes).toHaveLength(2)
    for (const lane of lanes) expect(lane.points.find(p => p.beat === 1)?.interpolation).toBe('hold')
    expect(automationPosition(lanes[0]!, 1.5)).toBe(0.9)
    expect(automationPosition(lanes[0]!, 3)).toBe(0.5)
    expect(automationPosition(lanes[1]!, 1.5)).toBe(0.25)
    expect(useProjectStore.getState().history.past).toHaveLength(1)
    expect(useControlStore.getState().overrides).toEqual([])
    useProjectStore.getState().undo(); expect(useProjectStore.getState().project).toBe(project)
  })
  it.each([{ kind: 'master' as const }, { kind: 'track' as const, trackId: 'r' }])('records return/master owner slots atomically (%j)', owner => {
    const { project } = setup(); useTouchStore.getState().arm(true)
    recallSavedSound({ id: 's', name: 'Bus', scope: { owner, domain: 'track' }, values: [{ target: { kind: 'mixer', owner, control: 'volume' }, value: 0.2 }] })
    const p = useProjectStore.getState().project
    const slot = owner.kind === 'master' ? p.master.automationSlots![0]! : p.tracks.find(t => t.kind === 'return')?.automationSlots![0]!
    expect(slot?.automation?.[0]?.points.find(p => p.beat === 1)?.value).toBe(0.2)
    useProjectStore.getState().undo(); expect(useProjectStore.getState().project).toBe(project)
  })
  it('records steps on the timeline lanes of the owners while the arrangement plays, in one step', () => {
    const { project, sound } = setup()
    const grouped = setGroupBus({ ...project, groups: [{ id: 'G', name: 'G', colour: 'red' }], tracks: project.tracks.map((t) => t.id === 'r' ? t : { ...t, groupId: 'G' }) }, 'G', true)
    useProjectStore.getState().resetProject(grouped); useTouchStore.getState().arm(true)
    useStatusStore.setState({ status: { ...useStatusStore.getState().status!, mode: 'arrangement', tracks: {}, masterAutomation: undefined } }); setTouchClock(() => 6)
    recallSavedSound(sound)
    const lanes = timelineLanesOf(useProjectStore.getState().project, volume.owner)
    expect(lanes).toHaveLength(2)
    expect(automationPosition(lanes[0]!, 5.9)).toBe(0.4)
    expect(automationPosition(lanes[0]!, 6)).toBe(0.9)
    expect(automationPosition(lanes[1]!, 7)).toBe(0.25)
    expect((useProjectStore.getState().project.tracks[0] as InstrumentTrack).clips).toBe((grouped.tracks[0] as InstrumentTrack).clips)
    const bus = { kind: 'group' as const, groupId: 'G' }
    recallSavedSound({ id: 'b', name: 'Bus', scope: { owner: bus, domain: 'track' }, values: [{ target: { kind: 'mixer', owner: bus, control: 'volume' }, value: 0.3 }] })
    expect(automationPosition(timelineLanesOf(useProjectStore.getState().project, bus)[0]!, 6)).toBe(0.3)
    expect(useProjectStore.getState().history.past).toHaveLength(2)
    expect(timelineLanesOpen(useProjectStore.getState().project, volume.owner)).toBe(true)
    useProjectStore.getState().undo(); useProjectStore.getState().undo()
    expect(timelineLanesOf(useProjectStore.getState().project, volume.owner)).toEqual([])
    useStatusStore.setState({ status: { ...useStatusStore.getState().status!, playing: false } })
    const before = useProjectStore.getState().project
    expect(() => recallSavedSound(sound)).toThrow('requires playback')
    expect(useProjectStore.getState().project).toBe(before)
  })
  it('rejects a whole armed recall when a destination is unavailable', () => {
    const { project, sound } = setup(); useTouchStore.getState().arm(true)
    useStatusStore.setState({ status: { ...useStatusStore.getState().status!, tracks: {} } })
    expect(() => recallSavedSound(sound)).toThrow('destination')
    expect(useProjectStore.getState().project).toBe(project)
    expect(useProjectStore.getState().history.past).toHaveLength(0)
  })
  it('rejects all changes when adding a second target would exceed the lane limit', () => {
    const { project, sound } = setup()
    const nodes = Array.from({ length: 63 }, (_, index) => ({ ...createNode('control', 0, 0), id: `control-${index}` }))
    const track = project.tracks[0] as InstrumentTrack, clip = track.clips[0]!
    const lanes = [...clip.automation!, ...nodes.map(node => ({ id: node.id, target: { kind: 'graph' as const, owner: volume.owner, domain: 'patch' as const, path: [], nodeId: node.id, nodeType: 'control', paramId: 'value' }, enabled: true, points: [] }))]
    const bounded = { ...project, tracks: [{ ...track, patch: { ...track.patch, nodes: [...track.patch.nodes, ...nodes] }, clips: [{ ...clip, automation: lanes }] }, ...project.tracks.slice(1)] }
    useProjectStore.getState().resetProject(bounded); useTouchStore.getState().arm(true)
    expect(() => recallSavedSound(sound)).toThrow('64 lanes')
    expect(useProjectStore.getState().project).toBe(bounded)
    expect(useProjectStore.getState().history.past).toHaveLength(0)
  })

})
