import { create } from 'zustand'
import { type ClockPosition, type ControlTarget, type ControlValue, type AutomationPoint, type AutomationLane, type EngineStatus, type Project, MAX_AUTOMATION_LANES, MAX_TOUCH_BEATS, MAX_TOUCH_SAMPLES, applyTouch, automationSlotsOf, controlTargetKey, controlToNormalized, resolveControlTarget, setClipAutomation, setAutomationSlot, commit } from '@core'
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
  arm: (armed) => { if (!armed) finishTouches(); set({ armed, feedback: armed ? 'Touch armed · play a clip or automation slot' : '' }) },
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
export const touchDestination = (project: Project, target: ControlTarget, status: EngineStatus | null) => {
  const owner = target.owner
  // A group has no clips or slots, so nothing plays its lanes: touch authors its base.
  const playing = owner.kind === 'master' ? status?.masterAutomation : owner.kind === 'group' ? undefined : status?.tracks[owner.trackId]
  const track = owner.kind === 'track' ? project.tracks.find((t) => t.id === owner.trackId) : undefined
  const slots = automationSlotsOf(project, owner)
  const clip = (slots ?? (track && track.kind !== 'return' ? track.clips : []))?.find((c) => c?.id === playing?.playingClipId)
  return status?.playing && clip && playing?.startBeat !== null && playing?.startBeat !== undefined ? { clip, start: playing.startBeat, playing } : undefined
}
interface Capture {
  target: ControlTarget
  clipId: string
  start: number
  length: number
  base: number
  samples: AutomationPoint[]
}
interface Take { epoch: number; captures: Map<string, Capture> }
const takes = new Map<string, Take>()
const publish = () => useTouchStore.setState({ recording: [...takes.values()].flatMap((t) => [...t.captures.keys()]) })
const feedback = (message: string) => useTouchStore.setState({ feedback: message })

/** Called only after MIDI pickup succeeds. Each gesture/source has an independent buffer. */
export const captureTouch = (source: string, changes: readonly ControlValue[], agoMs = 0): boolean => {
  if (!useTouchStore.getState().armed) return false
  const store = useProjectStore.getState(), status = useStatusStore.getState().status, beat = touchBeatNow(agoMs)
  if (!status?.playing || beat === undefined) { feedback('Touch unavailable: start playback with an active clip or automation slot'); return false }
  let captured = false, blocked = false
  for (const change of changes) {
    const resolved = resolveControlTarget(store.project, change.target), dest = touchDestination(store.project, change.target, status)
    if (!dest) { feedback('Touch unavailable: no active clip or automation slot for this owner'); continue }
    if (beat < dest.start - 1e-7) { feedback('Touch unavailable: event predates the active destination'); blocked = true; continue }
    if (resolved.status !== 'available' || !resolved.automatable) { feedback(`Touch unavailable: ${resolved.reason ?? 'control cannot be automated'}`); continue }
    const key = controlTargetKey(change.target)
    if ([...takes].some(([id, take]) => id !== source && take.captures.has(key))) { feedback('Touch unavailable: another source is touching this control'); blocked = true; continue }
    let take = takes.get(source)
    let capture = take?.captures.get(key)
    if (capture && (capture.clipId !== dest.clip.id || capture.start !== dest.start || capture.length !== dest.clip.lengthBeats)) { finishTouch(source); take = undefined; capture = undefined }
    // Wait for acknowledgement if a quantized launch may already have happened on the render thread.
    if (dest.playing.queued && beat >= Math.ceil((status.beat + 1e-9) / 4) * 4) { feedback('Touch unavailable: waiting for launch acknowledgement'); continue }
    if (!capture) {
      const lanes = dest.clip.automation ?? []
      if (lanes.length >= MAX_AUTOMATION_LANES && !lanes.some((l) => controlTargetKey(l.target) === key)) { feedback('Touch unavailable: 64 lane limit'); continue }
      if (take && take.captures.size >= MAX_AUTOMATION_LANES) { feedback('Touch unavailable: 64 lane take limit'); continue }
      take ??= { epoch: store.documentEpoch, captures: new Map() }
      takes.set(source, take)
      capture = { target: change.target, clipId: dest.clip.id, start: dest.start, length: dest.clip.lengthBeats, base: controlToNormalized(resolved.spec, resolved.baseValue), samples: [] }
      take.captures.set(key, capture)
    }
    const local = Math.max(0, capture.samples.at(-1)?.beat ?? 0, beat - capture.start), first = capture.samples[0]
    if (first && (local - first.beat > MAX_TOUCH_BEATS || [...take!.captures.values()].reduce((n, c) => n + c.samples.length, 0) >= MAX_TOUCH_SAMPLES - MAX_AUTOMATION_LANES)) { finishTouch(source, capture.start + first.beat + Math.min(MAX_TOUCH_BEATS, local - first.beat)); feedback('Touch limit reached; take finished'); blocked = true; continue }
    const sample: AutomationPoint = { id: crypto.randomUUID(), beat: local, value: controlToNormalized(resolved.spec, change.value), interpolation: resolved.interpolation }
    if (capture.samples.at(-1)?.beat === local) capture.samples[capture.samples.length - 1] = sample
    else capture.samples.push(sample)
    useControlStore.getState().setOverride(change.target, change.value)
    captured = true
  }
  if (captured) { feedback('Touch recording'); publish() }
  return captured || blocked
}

export const finishTouch = (source: string, endBeat = touchBeatNow()) => {
  const take = takes.get(source)
  if (!take) return
  takes.delete(source)
  const store = useProjectStore.getState()
  let project = store.project
  try {
    if (take.epoch !== store.documentEpoch) return
    for (const capture of take.captures.values()) {
      const owner = capture.target.owner, slots = automationSlotsOf(project, owner)
      const track = owner.kind === 'track' ? project.tracks.find((t) => t.id === owner.trackId) : undefined
      const clip = (slots ?? (track && track.kind !== 'return' ? track.clips : []))?.find((c) => c?.id === capture.clipId)
      const resolved = resolveControlTarget(project, capture.target)
      if (!clip || clip.lengthBeats !== capture.length || resolved.status !== 'available' || !resolved.automatable) throw new Error('Touch destination changed; take discarded')
      const samples = [...capture.samples], last = samples.at(-1)!
      const end = Math.max(last.beat, Math.min((endBeat ?? capture.start + last.beat) - capture.start, samples[0]!.beat + MAX_TOUCH_BEATS))
      if (end > last.beat) samples.push({ ...last, id: crypto.randomUUID(), beat: end })
      const key = controlTargetKey(capture.target), lanes = clip.automation ?? []
      const lane: AutomationLane = lanes.find((l) => controlTargetKey(l.target) === key) ?? { id: crypto.randomUUID(), target: capture.target, enabled: true, points: [] }
      const next = applyTouch(lane, samples, { offset: 0, length: capture.length, extent: capture.length }, capture.base)
      const updated = lanes.some((l) => l.id === lane.id) ? lanes.map((l) => l.id === lane.id ? next : l) : [...lanes, next]
      if (updated.length > MAX_AUTOMATION_LANES) throw new Error('Touch lane limit reached; take discarded')
      project = slots ? setAutomationSlot(project, owner, slots.findIndex((s) => s?.id === clip.id), { ...clip, automation: updated }) : owner.kind === 'track' ? setClipAutomation(project, owner.trackId, clip.id, updated) : project
    }
    if (project !== store.project) useProjectStore.setState({ project, history: commit(store.history, project, { now: Date.now() }) })
    feedback('Touch take saved')
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
/** Finish at the actual launch boundary; never redirect a held gesture into the next destination. */
export const reconcileTouches = (status: EngineStatus) => {
  for (const [source, take] of [...takes]) for (const capture of take.captures.values()) {
    const dest = touchDestination(useProjectStore.getState().project, capture.target, status)
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
