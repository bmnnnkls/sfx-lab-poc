import { create } from 'zustand'
import { type ClockPosition, type ControlTarget, type ControlValue, type AutomationPoint, type AutomationLane, type EngineStatus, type Project, MAX_AUTOMATION_LANES, MAX_TOUCH_BEATS, MAX_TOUCH_SAMPLES, applyTimelineTouch, applyTouch, automationSlotsOf, setTimelineLanes, timelineLanesOf, timelineLanesOpen, timelineOwnerAllowed, controlTargetKey, controlToNormalized, resolveControlTarget, setClipAutomation, setAutomationSlot, commit } from '@core'
import { useProjectStore } from './project-store'
import { useControlStore } from './control-store'
import { useStatusStore } from './status-store'

export const TOUCH_RELEASE_MS = 800
interface TouchState {
  readonly armed: boolean
  readonly recording: readonly string[]
  readonly feedback: string
  arm(armed: boolean): void
}
export const useTouchStore = create<TouchState>((set) => ({
  armed: false, recording: [], feedback: '',
  arm: (armed) => { if (!armed) finishTouches(); set({ armed, feedback: '' }) },
}))
/** The transport `agoMs` before now: a position (beat, run and loop pass), or just a beat (as tests give it). */
type PositionReader = (agoMs?: number) => ClockPosition | number | undefined
let clock: PositionReader | undefined
/** Connects touch to the audio clock (`AudioHost.recordingPosition`); called without a reader to disconnect. */
export const setTouchClock = (read?: PositionReader) => { clock = read }
/** Where the transport was `agoMs` before now; a bare beat takes the status's run and loop pass. */
export const touchPositionNow = (agoMs = 0): ClockPosition | undefined => {
  const status = useStatusStore.getState().status, read = clock ? clock(agoMs) : status?.beat
  return read === undefined ? undefined : typeof read === 'number' ? { beat: read, lap: status?.lap ?? 0, run: status?.run ?? 0 } : read
}
export const touchBeatNow = (agoMs = 0) => touchPositionNow(agoMs)?.beat
/** Where the take of a control goes: the owner's playing clip or slot in the Session, its timeline lanes in the Arrangement. */
export const touchDestination = (project: Project, target: ControlTarget, status: EngineStatus | null) => {
  const owner = target.owner
  if (status?.playing && status.mode === 'arrangement') {
    const loop = project.arrangementLoop
    return timelineOwnerAllowed(project, owner) ? { kind: 'timeline' as const, owner, ...(loop?.enabled && { brace: { from: loop.from, to: loop.to } }), run: status.run ?? 0 } : undefined
  }
  // A group has no clips or slots, so nothing plays its lanes: touch authors its base.
  const playing = owner.kind === 'master' ? status?.masterAutomation : owner.kind === 'group' ? undefined : status?.tracks[owner.trackId]
  const track = owner.kind === 'track' ? project.tracks.find((t) => t.id === owner.trackId) : undefined
  const slots = automationSlotsOf(project, owner)
  const clip = (slots ?? (track && track.kind !== 'return' ? track.clips : []))?.find((c) => c?.id === playing?.playingClipId)
  return status?.playing && clip && playing?.startBeat !== null && playing?.startBeat !== undefined ? { kind: 'clip' as const, clip, start: playing.startBeat, playing } : undefined
}
interface ClipCapture {
  kind: 'clip'
  target: ControlTarget
  clipId: string
  start: number
  length: number
  base: number
  samples: AutomationPoint[]
}
/** Samples in take time (`takeTime`), in the run the take began in. */
interface TimelineCapture {
  kind: 'timeline'
  target: ControlTarget
  run: number
  /** The loop brace, when it was on and the take began before its end: passes go into it. */
  brace?: { readonly from: number; readonly to: number }
  /** The brace as it was when the take began ('' when off), so a change ends the take. */
  braceKey: string
  base: number
  samples: AutomationPoint[]
}
type Capture = ClipCapture | TimelineCapture
interface Take { epoch: number; captures: Map<string, Capture> }
const takes = new Map<string, Take>()
const publish = () => useTouchStore.setState({ recording: [...takes.values()].flatMap((t) => [...t.captures.keys()]) })
const feedback = (message: string) => useTouchStore.setState({ feedback: message })
const braceKeyOf = (project: Project) => (project.arrangementLoop?.enabled ? `${project.arrangementLoop.from}:${project.arrangementLoop.to}` : '')
/** A position in the take's own time, which only goes forward within a run: each loop pass adds the brace's length. */
const takeTime = (capture: TimelineCapture, at: Pick<ClockPosition, 'beat' | 'lap'>) => at.beat + (capture.brace ? (at.lap ?? 0) * (capture.brace.to - capture.brace.from) : 0)
/** Why a timeline take ended before its control was released; the feedback names it. */
type EndReason = 'jumped' | 'loop' | 'switched'
const ENDED: Record<EndReason, string> = { jumped: 'Touch take saved; the transport jumped', loop: 'Touch take saved; the loop changed', switched: 'Touch take saved; playback switched' }
const isFolder = (project: Project, target: ControlTarget) => target.owner.kind === 'group' && !timelineOwnerAllowed(project, target.owner)

/** Called only after MIDI pickup succeeds. Each gesture/source has an independent buffer. */
export const captureTouch = (source: string, changes: readonly ControlValue[], agoMs = 0): boolean => {
  if (!useTouchStore.getState().armed) return false
  const store = useProjectStore.getState(), status = useStatusStore.getState().status, at = touchPositionNow(agoMs), beat = at?.beat
  if (!status?.playing || !at || beat === undefined) { feedback('Touch unavailable: start playback with an active clip, automation slot or the arrangement'); return false }
  let captured = false, blocked = false, timeline = false
  for (const change of changes) {
    const resolved = resolveControlTarget(store.project, change.target), dest = touchDestination(store.project, change.target, status)
    if (!dest) { feedback(isFolder(store.project, change.target) ? 'Touch unavailable: a folder has no lanes (give the group a bus)' : status.mode === 'arrangement' ? 'Touch unavailable: this owner has no timeline lanes' : 'Touch unavailable: no active clip or automation slot for this owner'); continue }
    if (dest.kind === 'clip' && beat < dest.start - 1e-7) { feedback('Touch unavailable: event predates the active destination'); blocked = true; continue }
    if (resolved.status !== 'available' || !resolved.automatable) { feedback(`Touch unavailable: ${resolved.reason ?? 'control cannot be automated'}`); continue }
    const key = controlTargetKey(change.target)
    if ([...takes].some(([id, take]) => id !== source && take.captures.has(key))) { feedback('Touch unavailable: another source is touching this control'); blocked = true; continue }
    let take = takes.get(source)
    let capture = take?.captures.get(key)
    if (capture && capture.kind !== dest.kind) { finishTouch(source, null, 'switched'); take = undefined; capture = undefined }
    else if (capture?.kind === 'clip' && dest.kind === 'clip' && (capture.clipId !== dest.clip.id || capture.start !== dest.start || capture.length !== dest.clip.lengthBeats)) { finishTouch(source); take = undefined; capture = undefined }
    else if (capture?.kind === 'timeline') {
      // An event from before a seek: the take it belonged to has ended.
      if (at.run < capture.run) { blocked = true; continue }
      const why: EndReason | undefined = at.run > capture.run ? 'jumped' : braceKeyOf(store.project) !== capture.braceKey ? 'loop' : undefined
      if (why) { finishTouch(source, null, why); take = undefined; capture = undefined }
    }
    if (dest.kind === 'clip') {
      // Wait for acknowledgement if a quantized launch may already have happened on the render thread.
      if (dest.playing.queued && beat >= Math.ceil((status.beat + 1e-9) / 4) * 4) { feedback('Touch unavailable: waiting for launch acknowledgement'); continue }
    }
    if (!capture) {
      const lanes = dest.kind === 'clip' ? dest.clip.automation ?? [] : timelineLanesOf(store.project, dest.owner)
      if (lanes.length >= MAX_AUTOMATION_LANES && !lanes.some((l) => controlTargetKey(l.target) === key)) { feedback('Touch unavailable: 64 lane limit'); continue }
      if (take && take.captures.size >= MAX_AUTOMATION_LANES) { feedback('Touch unavailable: 64 lane take limit'); continue }
      take ??= { epoch: store.documentEpoch, captures: new Map() }
      takes.set(source, take)
      const base = controlToNormalized(resolved.spec, resolved.baseValue)
      capture = dest.kind === 'clip'
        ? { kind: 'clip', target: change.target, clipId: dest.clip.id, start: dest.start, length: dest.clip.lengthBeats, base, samples: [] }
        : { kind: 'timeline', target: change.target, run: at.run, ...(dest.brace && beat < dest.brace.to - 1e-7 && { brace: dest.brace }), braceKey: braceKeyOf(store.project), base, samples: [] }
      take.captures.set(key, capture)
    }
    const local = Math.max(0, capture.samples.at(-1)?.beat ?? 0, capture.kind === 'clip' ? beat - capture.start : takeTime(capture, at)), first = capture.samples[0]
    if (first && (local - first.beat > MAX_TOUCH_BEATS || [...take!.captures.values()].reduce((n, c) => n + c.samples.length, 0) >= MAX_TOUCH_SAMPLES - MAX_AUTOMATION_LANES)) {
      const limit = first.beat + Math.min(MAX_TOUCH_BEATS, local - first.beat)
      finishTouch(source, capture.kind === 'clip' ? capture.start + limit : limit); feedback('Touch limit reached; take finished'); blocked = true; continue
    }
    const sample: AutomationPoint = { id: crypto.randomUUID(), beat: local, value: controlToNormalized(resolved.spec, change.value), interpolation: resolved.interpolation }
    if (capture.samples.at(-1)?.beat === local) capture.samples[capture.samples.length - 1] = sample
    else capture.samples.push(sample)
    useControlStore.getState().setOverride(change.target, change.value)
    captured = true
    timeline ||= capture.kind === 'timeline'
  }
  if (captured) { feedback(timeline ? 'Touch → timeline' : 'Touch recording'); publish() }
  return captured || blocked
}

/**
 * Where a take ends: a position on the transport (a release, ■), a beat (a clip's launch boundary; take time for a
 * timeline take, at its limit), or `null` for its last sample.
 */
export type TouchEnd = ClockPosition | number | null | undefined
/** Whether a region on the owner's track has its own lane on the target: the timeline lane silences it. */
const replacesRegionLane = (project: Project, target: ControlTarget) => {
  const owner = target.owner, key = controlTargetKey(target)
  return owner.kind === 'track' && (project.arrangement ?? []).some((region) => region.trackId === owner.trackId && region.content.automation?.some((lane) => controlTargetKey(lane.target) === key))
}

export const finishTouch = (source: string, end: TouchEnd = touchPositionNow(), reason?: EndReason) => {
  const take = takes.get(source)
  if (!take) return
  takes.delete(source)
  const store = useProjectStore.getState()
  let project = store.project
  const opened: ControlTarget['owner'][] = []
  let timeline = false, regions = false
  try {
    if (take.epoch !== store.documentEpoch) return
    for (const capture of take.captures.values()) {
      const owner = capture.target.owner, resolved = resolveControlTarget(project, capture.target)
      const samples = [...capture.samples], last = samples.at(-1)!
      const key = controlTargetKey(capture.target)
      if (capture.kind === 'timeline') {
        if (!timelineOwnerAllowed(project, owner) || resolved.status !== 'available' || !resolved.automatable) throw new Error('Touch destination changed; take discarded')
        const at = end === null || end === undefined ? last.beat : typeof end === 'number' ? end : end.run === capture.run ? takeTime(capture, end) : last.beat
        const stop = Math.max(last.beat, Math.min(at, samples[0]!.beat + MAX_TOUCH_BEATS))
        if (stop > last.beat) samples.push({ ...last, id: crypto.randomUUID(), beat: stop })
        const lanes = timelineLanesOf(project, owner)
        const existing = lanes.find((l) => controlTargetKey(l.target) === key)
        const next = applyTimelineTouch(existing ?? { id: crypto.randomUUID(), target: capture.target, enabled: true, points: [] }, samples, capture.brace, capture.base)
        const updated = existing ? lanes.map((l) => l.id === existing.id ? next : l) : [...lanes, next]
        if (updated.length > MAX_AUTOMATION_LANES) throw new Error('Touch lane limit reached; take discarded')
        project = setTimelineLanes(project, owner, updated)
        if (!existing && !timelineLanesOpen(project, owner)) opened.push(owner)
        timeline = true
        regions ||= replacesRegionLane(project, capture.target)
        continue
      }
      const slots = automationSlotsOf(project, owner)
      const track = owner.kind === 'track' ? project.tracks.find((t) => t.id === owner.trackId) : undefined
      const clip = (slots ?? (track && track.kind !== 'return' ? track.clips : []))?.find((c) => c?.id === capture.clipId)
      if (!clip || clip.lengthBeats !== capture.length || resolved.status !== 'available' || !resolved.automatable) throw new Error('Touch destination changed; take discarded')
      const endBeat = typeof end === 'object' && end !== null ? end.beat : end
      const stop = Math.max(last.beat, Math.min((endBeat ?? capture.start + last.beat) - capture.start, samples[0]!.beat + MAX_TOUCH_BEATS))
      if (stop > last.beat) samples.push({ ...last, id: crypto.randomUUID(), beat: stop })
      const lanes = clip.automation ?? []
      const lane: AutomationLane = lanes.find((l) => controlTargetKey(l.target) === key) ?? { id: crypto.randomUUID(), target: capture.target, enabled: true, points: [] }
      const next = applyTouch(lane, samples, { offset: 0, length: capture.length, extent: capture.length }, capture.base)
      const updated = lanes.some((l) => l.id === lane.id) ? lanes.map((l) => l.id === lane.id ? next : l) : [...lanes, next]
      if (updated.length > MAX_AUTOMATION_LANES) throw new Error('Touch lane limit reached; take discarded')
      project = slots ? setAutomationSlot(project, owner, slots.findIndex((s) => s?.id === clip.id), { ...clip, automation: updated }) : owner.kind === 'track' ? setClipAutomation(project, owner.trackId, clip.id, updated) : project
    }
    if (project !== store.project) useProjectStore.setState({ project, history: commit(store.history, project, { now: Date.now() }) })
    // The new lane shows under its owner's row: a view field, outside the undo step.
    for (const owner of opened) useProjectStore.getState().setTimelineLanesOpen(owner, true)
    feedback(`${reason ? ENDED[reason] : timeline ? 'Touch take saved to the timeline' : 'Touch take saved'}${regions ? " · replaces the region's lane on this control" : ''}`)
  } catch (error) { feedback(error instanceof Error ? error.message : 'Touch take discarded') }
  finally {
    for (const capture of take.captures.values()) useControlStore.getState().release(capture.target)
    publish()
  }
}
export const finishTouches = () => { for (const source of [...takes.keys()]) finishTouch(source) }
export const cancelTouches = () => {
  const targets = [...takes.values()].flatMap((t) => [...t.captures.values()].map((c) => c.target))
  takes.clear(); publish()
  for (const target of targets) useControlStore.getState().release(target)
  useTouchStore.setState({ armed: false, feedback: '' })
}
/**
 * Finish at the actual launch boundary; never redirect a held gesture into the next destination. A timeline take ends
 * at its last sample when the transport jumps (a new run), the loop changes or playback switches to the Session.
 */
export const reconcileTouches = (status: EngineStatus) => {
  const project = useProjectStore.getState().project
  for (const [source, take] of [...takes]) for (const capture of take.captures.values()) {
    const dest = touchDestination(project, capture.target, status)
    if (capture.kind === 'timeline') {
      const why: EndReason | undefined = status.playing && status.mode !== 'arrangement' ? 'switched' : dest?.kind === 'timeline' && dest.run > capture.run ? 'jumped' : dest && braceKeyOf(project) !== capture.braceKey ? 'loop' : undefined
      if (why || !dest) { finishTouch(source, null, why); break }
      const now = (status.run ?? 0) === capture.run ? takeTime(capture, { beat: status.beat, lap: status.lap ?? 0 }) : undefined
      if (now !== undefined && now - capture.samples[0]!.beat >= MAX_TOUCH_BEATS) { finishTouch(source, capture.samples[0]!.beat + MAX_TOUCH_BEATS); feedback('Touch limit reached; take finished'); break }
      continue
    }
    if (dest?.kind === 'timeline') { finishTouch(source, null, 'switched'); break }
    if (!dest || dest.clip.id !== capture.clipId || dest.start !== capture.start || dest.clip.lengthBeats !== capture.length) {
      const previous = useStatusStore.getState().status
      const owner = capture.target.owner
      const old = owner.kind === 'master' ? previous?.masterAutomation : owner.kind === 'group' ? undefined : previous?.tracks[owner.trackId]
      const next = owner.kind === 'master' ? status.masterAutomation : owner.kind === 'group' ? undefined : status.tracks[owner.trackId]
      const boundary = dest?.start ?? next?.stopBeat ?? (old?.queued ? Math.ceil(((previous?.beat ?? 0) + 1e-9) / 4) * 4 : undefined)
      finishTouch(source, boundary); break
    }
    if (status.beat - capture.start - capture.samples[0]!.beat >= MAX_TOUCH_BEATS) { finishTouch(source, capture.start + capture.samples[0]!.beat + MAX_TOUCH_BEATS); feedback('Touch limit reached; take finished'); break }
  }
}

export const finishTargetTouch = (target: ControlTarget) => {
  for (const [source, take] of [...takes]) if (take.captures.has(controlTargetKey(target))) finishTouch(source)
}
