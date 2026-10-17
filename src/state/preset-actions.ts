import { type Project, type Snapshot, type ProjectPreset, type SnapshotScope, type ControlValue, commit, controlTargetKey, controlToNormalized, resolveControlTarget, recallSnapshot, recallProjectPreset, stepRecallLane, automationSlotsOf, setAutomationSlot, setClipAutomation, MAX_AUTOMATION_LANES } from '@core'
import { useProjectStore } from './project-store'
import { useTouchStore, touchBeatNow, touchDestination, finishTouches } from './touch-store'
import { useStatusStore } from './status-store'
import { useControlStore } from './control-store'
export const editPresetProject = (edit: (project: Project) => Project) => {
  const store = useProjectStore.getState(), project = edit(store.project)
  if (project !== store.project) useProjectStore.setState({ project, history: commit(store.history, project, { now: Date.now() }) })
}
const recordRecall = (project: Project, changes: readonly ControlValue[]): Project => {
  if (!useTouchStore.getState().armed) return project
  const status = useStatusStore.getState().status, beat = touchBeatNow()
  if (!status?.playing || beat === undefined) throw new Error('Armed recall requires playback and an active clip/slot for every affected owner')
  let next = project
  for (const entry of changes) {
    const dest = touchDestination(next, entry.target, status), resolved = resolveControlTarget(project, entry.target)
    if (!dest || beat < dest.start || dest.playing.queued) throw new Error('Armed recall needs an acknowledged active destination for every affected owner')
    if (resolved.status !== 'available' || !resolved.automatable) throw new Error('Recall control cannot be recorded')
    const key = controlTargetKey(entry.target), lanes = dest.clip.automation ?? []
    const lane = lanes.find(l => controlTargetKey(l.target) === key) ?? { id: crypto.randomUUID(), target: entry.target, enabled: true, points: [] }
    const updated = stepRecallLane(lane, beat - dest.start, controlToNormalized(resolved.spec, entry.value), dest.clip.lengthBeats, controlToNormalized(resolved.spec, resolved.baseValue))
    const automation = lanes.some(l => l.id === lane.id) ? lanes.map(l => l.id === lane.id ? updated : l) : [...lanes, updated]
    if (automation.length > MAX_AUTOMATION_LANES) throw new Error('Recall exceeds 64 lanes; no changes recorded')
    const slots = automationSlotsOf(next, entry.target.owner)
    next = slots ? setAutomationSlot(next, entry.target.owner, slots.findIndex(c => c?.id === dest.clip.id), { ...dest.clip, automation }) : entry.target.owner.kind === 'track' ? setClipAutomation(next, entry.target.owner.trackId, dest.clip.id, automation) : next
  }
  return next
}
/** Bases, discrete sample state and all recorded steps enter one history transaction. Read stays authoritative. */
export const recallSavedSound = (sound: Snapshot | ProjectPreset, scope?: SnapshotScope): string => {
  finishTouches()
  const store = useProjectStore.getState()
  const result = 'revisionId' in sound ? recallProjectPreset(store.project, sound, scope) : recallSnapshot(store.project, sound)
  // Record against the old bases, before recall changes them.
  const recorded = recordRecall(store.project, result.applied)
  const project = recorded === store.project ? result.project : { ...result.project, tracks: result.project.tracks.map(t => {
    const rec = recorded.tracks.find(r => r.id === t.id)!
    return t.kind === 'return' && rec.kind === 'return' ? { ...t, automationSlots: rec.automationSlots } : t.kind !== 'return' && rec.kind !== 'return' ? { ...t, clips: rec.clips } as typeof t : t
  }), master: { ...result.project.master, automationSlots: recorded.master.automationSlots } }
  if (project !== store.project) useProjectStore.setState({ project, history: commit(store.history, project, { now: Date.now() }) })
  for (const entry of result.applied) useControlStore.getState().release(entry.target)
  const controlled = result.applied.filter(e => useControlStore.getState().playback.some(p => controlTargetKey(p.target) === controlTargetKey(e.target))).length
  return `${result.applied.length} controls recalled${controlled ? ` · ${controlled} controlled by Read` : ''}${result.issues.length ? ` · ${result.issues.length} unavailable: ${result.issues.map(i => `${i.target.kind === 'graph' ? i.target.nodeId : i.target.control}: ${i.reason}`).join('; ')}` : ''}`
}
