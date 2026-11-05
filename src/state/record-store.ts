import { create } from 'zustand'
import { type ArrangementClip, type ClockPosition, type Clip, type EngineStatus, type Note, type Project, type TakeEvent, type TakeLoop, EARLY_BEATS, MAX_CLIP_BEATS, MAX_TAKE_NOTES, MAX_TIMELINE_BEATS, MIN_CLIP_BEATS, REGION_BEATS, addArrangementClip, commit, createArrangementClip, createClip, finishedNotes, sessionClipRef, setClipAt, setClipLength, setClipNotes, splitRegions, takeNotes, updateArrangementClip } from '@core'
import { guardHistory, useProjectStore } from './project-store'
import { transportBeat, transportPosition } from './record-clock'
import { useSelectionStore } from './selection-store'
import { useRecordSettings } from './record-settings'
import { useStatusStore } from './status-store'

const BAR = 4
/** A press ends the take at the next bar at least this far ahead, so the new length reaches the engine before it loops. */
const END_MARGIN = 0.25
const EPSILON = 1e-9
/** How long a new take waits for the engine to report its clip queued or playing before it is given up. */
const LAUNCH_WAIT_MS = 2000

export type TakeState = 'queued' | 'recording' | 'ending'
/**
 * A take into a new clip in an empty slot (the slot's ●), an overdub into a clip already playing on an armed track
 * while ● Rec is on, or new regions on the arrangement while ● Rec is on and the arrangement plays.
 */
export type TakeKind = 'slot' | 'overdub' | 'region'
/** What the view shows of a take: one per track at most. */
export interface TakeView {
  readonly id: string
  readonly kind: TakeKind
  /** The clip a Session take records into ('' for an arrangement take), and its scene (−1). */
  readonly clipId: string
  readonly scene: number
  readonly state: TakeState
  /** An arrangement take: the regions it has made so far, which the view draws red and locks. */
  readonly regions?: readonly string[]
  /** An arrangement take: where the outline of what is recording starts (before its first note, the region's start). */
  readonly outlineFrom?: number
}

interface RecordState {
  /** The armed instrument tracks. Transient: not saved, not undone. */
  readonly armed: readonly string[]
  /** ● Rec: what you play over a clip playing on an armed track is added to it. Transient, like the arm. */
  readonly rec: boolean
  readonly takes: Readonly<Record<string, TakeView>>
  readonly feedback: string
  /** Arms or disarms a track; a track that isn't an instrument can't be armed. Disarming ends its take at the next bar. */
  arm(trackId: string, on: boolean): void
  /** Turns ● Rec on or off; off ends every overdub now. */
  setRec(on: boolean): void
}

/** What an arrangement take keeps beside the common fields. Its `start` and events are in take time (`takeTime`). */
interface RegionTake {
  /** The run it records in, once known; a take from ▶ or a seek adopts the first run after `runAfter`. */
  run?: number
  readonly runAfter: number
  /** Events played before the run was known, with their beats as the clock gave them. */
  readonly pending: { readonly event: TakeEvent; readonly lap: number; readonly run?: number }[]
  /** Where recording began on the timeline: the position ▶ played from, or the punch-in. */
  readonly from: number
  /** Where its first region starts: the bar `from` is in, or the brace's start once it has looped. */
  origin: number
  /** The loop brace, when it was on and recording began before its end: passes merge into one region. */
  readonly brace?: { readonly from: number; readonly to: number }
  /** The brace as it was when the take opened ('' when off), so a change ends the take. */
  readonly braceKey: string
  /** The loop pass recording began in; a later one means the take has looped. */
  readonly startLap: number
  looped: boolean
  /** Where its regions end on the timeline: the end of the bar the playhead is in, or the brace's end. */
  extent: number
  /** The regions it has made, by 64-bar segment from `origin`. */
  readonly segments: (string | undefined)[]
  /** Each region as the take last wrote it: anything else changing it ends the take. */
  readonly mine: Map<string, ArrangementClip>
  /** The last place the clock reported, for an end with no clock (the transport already stopped). */
  lastBeat: number
  lastLap: number
}

interface Take {
  readonly id: string
  readonly kind: TakeKind
  /** The undo step it commits under, `record:<pass>`: takes that run at the same time share one. */
  readonly pass: string
  /** An arrangement take's own state. */
  readonly region?: RegionTake
  /** Overdub: where the clip's passes are counted from and how long they are, once it plays. */
  loop?: TakeLoop
  /** How early a note may count as on the start: a sixteenth, but nothing at a punch-in. */
  early: number
  readonly trackId: string
  readonly clipId: string
  readonly scene: number
  readonly epoch: number
  state: TakeState
  /** The transport beat the take records from: the clip's launch boundary, once the status reports it. */
  start?: number
  /** Where it ends: set by a press, the fixed length or the 64-bar limit. */
  end?: number
  /** The beat a press asked to end at, while the start is not known yet. */
  endAsked?: number
  /** Why it ends, for the feedback. */
  limit?: boolean
  readonly events: TakeEvent[]
  /** When it was opened, and whether the engine has reported its clip queued or playing yet. */
  readonly openedAt: number
  seen: boolean
  /** The ids of the notes already written into the clip. */
  readonly written: Set<string>
}

const takes = new Map<string, Take>()
/**
 * The beat ● Rec went on, and each track was armed, on this run of the transport (−Infinity before it ran): an overdub
 * records from the later of these and its clip's start.
 */
let recSince = -Infinity
const armedSince = new Map<string, number>()
/** The beats start again from 0 when the transport stops, so what was noted on the last run no longer applies. */
const forgetSince = () => { recSince = -Infinity; armedSince.clear() }
const sinceFor = (trackId: string) => Math.max(recSince, armedSince.get(trackId) ?? -Infinity)

export const useRecordStore = create<RecordState>((set, get) => ({
  armed: [], rec: false, takes: {}, feedback: '',
  arm: (trackId, on) => {
    const armed = get().armed
    if (on) {
      const track = useProjectStore.getState().project.tracks.find((t) => t.id === trackId)
      if (track?.kind !== 'instrument' || armed.includes(trackId)) return
      armedSince.set(trackId, transportBeat() ?? -Infinity)
      blocked.delete(trackId)
      set({ armed: [...armed, trackId], feedback: takes.size ? get().feedback : get().rec ? recFeedback() : 'Press ● on an empty slot to record' })
      if (get().rec) reconcileNow()
      return
    }
    if (!armed.includes(trackId)) return
    const take = takes.get(trackId)
    if (take?.kind === 'overdub' || take?.kind === 'region') finish(take, beatNow())
    else if (take) endTake(trackId)
    armedSince.delete(trackId)
    const rest = armed.filter((id) => id !== trackId)
    set({ armed: rest, ...(rest.length === 0 && takes.size === 0 && { feedback: get().rec ? recFeedback() : '' }) })
  },
  setRec: (on) => {
    if (on === get().rec) return
    if (on) {
      recSince = transportBeat() ?? -Infinity
      blocked.clear()
      set({ rec: true })
      reconcileNow()
      feedback(recFeedback())
      return
    }
    set({ rec: false })
    const now = beatNow()
    for (const take of [...takes.values()]) {
      if (take.kind === 'region') { if (take.state === 'queued') drop(take); else endRegion(take, now) }
      else if (take.kind === 'overdub') { if (take.start === undefined) drop(take); else finish(take, now) }
    }
    feedback(takes.size ? recordingText() : '')
  },
}))

const feedback = (message: string) => useRecordStore.setState({ feedback: message })
const trackName = (trackId: string) => useProjectStore.getState().project.tracks.find((t) => t.id === trackId)?.name ?? 'a track'
const publish = () => {
  const views: Record<string, TakeView> = {}
  for (const take of takes.values()) views[take.trackId] = { id: take.id, kind: take.kind, clipId: take.clipId, scene: take.scene, state: take.state, ...(take.region && regionView(take.region)) }
  useRecordStore.setState({ takes: views })
}
/** *Recording Bass*, *Overdubbing Lead*, or both. */
const recordingText = () => {
  const named = (kind: TakeKind) => [...takes.values()].filter((take) => take.kind === kind).map((take) => trackName(take.trackId))
  const slot = [...named('slot'), ...named('region')], overdub = named('overdub')
  return [slot.length ? `Recording ${slot.join(', ')}` : '', overdub.length ? `Overdubbing ${overdub.join(', ')}` : ''].filter(Boolean).join(' · ')
}
const recording = () => { if (takes.size) feedback(recordingText()) }
/** What ● Rec says while it is on: who records, or why nothing does. */
const recFeedback = () => {
  if (useRecordStore.getState().armed.length === 0) return 'Armed tracks: none'
  if (takes.size) return recordingText()
  const status = useStatusStore.getState().status
  if (!status?.playing) return 'Launch a clip on an armed track, or press ▶ on the Arrangement, to record'
  return status.mode === 'arrangement' ? 'Recording from here' : 'Launch a clip on an armed track to overdub'
}

/** The next bar at least `margin` beats after `beat`. */
const nextBar = (beat: number, margin = 0) => Math.ceil((beat + margin - EPSILON) / BAR) * BAR
/** The beat now, on the transport: the audio clock, else the last status. */
const beatNow = () => transportBeat() ?? useStatusStore.getState().status?.beat ?? 0

const clipOf = (project: Project, take: Take): Clip | undefined => {
  const track = project.tracks.find((t) => t.id === take.trackId)
  const clip = track?.kind === 'instrument' ? track.clips.find((c) => c?.id === take.clipId) : undefined
  return clip ?? undefined
}

/** Commits an edit as part of the take: one key for the whole take, so it is one undo step unless other edits come between. */
const commitTake = (take: Take, change: (project: Project) => Project) => {
  const store = useProjectStore.getState()
  const project = change(store.project)
  if (project === store.project) return
  useProjectStore.setState({ project, history: commit(store.history, project, { key: `record:${take.pass}`, now: Date.now(), mergeWindowMs: Infinity }) })
}

/** Writes the notes not in the clip yet; false when the take can't go on (the clip is gone, or full). */
const write = (take: Take, notes: readonly Note[]): boolean => {
  const clip = clipOf(useProjectStore.getState().project, take)
  if (!clip) { drop(take, 'The take ended: its clip was removed'); return false }
  const fresh = notes.filter((note) => !take.written.has(note.id))
  if (fresh.length === 0) return true
  const room = Math.max(0, MAX_TAKE_NOTES - clip.notes.length)
  const kept = fresh.slice(0, room)
  for (const note of kept) take.written.add(note.id)
  if (kept.length) commitTake(take, (project) => setClipNotes(project, sessionClipRef(take.trackId, take.clipId), [...clip.notes, ...kept]))
  return kept.length === fresh.length
}

const drop = (take: Take, message?: string) => {
  takes.delete(take.trackId)
  publish()
  if (message) feedback(message)
  else if (takes.size) recording()
  if (take.region) passEnded(take.pass, false)
}

/** The take's range for the take model: its start and end, how early a note may be, and an overdub's passes. */
const rangeOf = (take: Take) => ({ id: take.id, start: take.start!, end: take.end, early: take.early, ...(take.loop && { loop: take.loop }) })

/** Writes what is finished so far. */
const writeFinished = (take: Take) => {
  if (take.start === undefined) return
  if (!write(take, finishedNotes(take.events, rangeOf(take), Infinity))) {
    if (takes.get(take.trackId) === take) finish(take, nextBar(beatNow()), `${MAX_TAKE_NOTES} notes reached: the take ended`)
  }
}

/**
 * Ends a take at `end` and makes it done: held notes are closed at `close` (`end` by default), every note written, and
 * the clip's length set to the bars recorded, at least one.
 */
const finish = (take: Take, end: number, message?: string, close = end) => {
  if (take.kind === 'overdub') { endOverdub(take, close, message); return }
  if (take.kind === 'region') { endRegion(take, close, message); return }
  const start = take.start
  takes.delete(take.trackId)
  publish()
  if (start === undefined) { feedback(message ?? (takes.size ? '' : 'The take ended before it started')); if (takes.size) recording(); return }
  const length = Math.min(MAX_CLIP_BEATS, Math.max(BAR, end - start))
  write(take, takeNotes(take.events, { ...rangeOf(take), end: Math.min(close, start + length) }))
  if (useProjectStore.getState().documentEpoch === take.epoch && clipOf(useProjectStore.getState().project, take)) {
    commitTake(take, (project) => setClipLength(project, sessionClipRef(take.trackId, take.clipId), length))
    const clip = clipOf(useProjectStore.getState().project, take)
    const bars = length / BAR
    feedback(message ?? `Recorded ${bars} bar${bars === 1 ? '' : 's'} into ${clip?.name ?? 'the clip'}`)
  }
  if (takes.size && !message) recording()
}

/**
 * Ends an overdub at `at`: its held notes close there (cut at the clip's end), every note is written, and the clip is
 * left as long as it was. Nothing played, nothing written: an empty overdub leaves no undo step.
 */
const endOverdub = (take: Take, at: number, message?: string) => {
  takes.delete(take.trackId)
  publish()
  if (take.start !== undefined && take.epoch === useProjectStore.getState().documentEpoch && at > take.start) write(take, takeNotes(take.events, { ...rangeOf(take), end: at }))
  if (message) feedback(message)
  else if (takes.size) recording()
  else if (useRecordStore.getState().rec) feedback(recFeedback())
}

/** A take opened while others run joins their undo step, so takes that run at the same time are one step together. */
const passFor = () => takes.values().next().value?.pass ?? `pass-${crypto.randomUUID()}`

const newTake = (kind: TakeKind, trackId: string, clipId: string, scene: number, events: TakeEvent[] = []): Take =>
  ({ id: `take-${crypto.randomUUID()}`, kind, pass: passFor(), trackId, clipId, scene, epoch: useProjectStore.getState().documentEpoch, state: 'queued', early: EARLY_BEATS, events, openedAt: Date.now(), seen: false, written: new Set() })

/** The clip with that id in a track's slots, and its scene. */
const sessionClip = (project: Project, trackId: string, clipId: string): { clip: Clip; scene: number } | undefined => {
  const track = project.tracks.find((t) => t.id === trackId)
  if (track?.kind !== 'instrument') return undefined
  const scene = track.clips.findIndex((c) => c?.id === clipId)
  return scene < 0 ? undefined : { clip: track.clips[scene]!, scene }
}

/**
 * Opens an overdub on a clip of an armed track, queued until it plays. `events` carries over what a take that ended at
 * the same boundary had, so nothing played around it is lost.
 */
const openOverdub = (trackId: string, clipId: string, events?: TakeEvent[]): Take | undefined => {
  const found = sessionClip(useProjectStore.getState().project, trackId, clipId)
  if (!found) return undefined
  const take = newTake('overdub', trackId, clipId, found.scene, events)
  take.seen = true
  takes.set(trackId, take)
  return take
}

/**
 * Starts an overdub when its clip plays from `anchor`: it records from the later of that and `since` (● Rec on, the
 * arm, or the end of the take before it). Early notes count only from the clip's own start.
 */
const startOverdub = (take: Take, anchor: number, since: number, early = since <= anchor + EPSILON) => {
  const clip = clipOf(useProjectStore.getState().project, take)
  if (!clip) { drop(take); return }
  take.loop = { anchor, length: clip.lengthBeats }
  take.start = Math.max(anchor, since)
  take.early = early ? EARLY_BEATS : 0
  take.state = 'recording'
  publish()
  recording()
  writeFinished(take)
}

/** Sets where a started take ends, and the clip's length to match, now: the engine loops there with no gap. */
const setEnd = (take: Take, end: number) => {
  const start = take.start!
  take.end = Math.min(start + MAX_CLIP_BEATS, Math.max(start + BAR, end))
  take.state = 'ending'
  commitTake(take, (project) => setClipLength(project, sessionClipRef(take.trackId, take.clipId), take.end! - start))
  publish()
}

/**
 * The slot's ●: makes a new clip in an empty slot of an armed instrument track (`Clip <scene + 1>`, as long as the fixed
 * length, else 64 bars until the take ends), launches it, and records into it from the launch boundary. A take already
 * running on the track ends at the next bar, where the new one starts.
 */
export const recordInSlot = (trackId: string, scene: number, launch: (trackId: string, clipId: string) => void): boolean => {
  const store = useProjectStore.getState()
  const track = store.project.tracks.find((t) => t.id === trackId)
  if (track?.kind !== 'instrument' || track.clips[scene] === undefined || track.clips[scene] !== null) return false
  if (!useRecordStore.getState().armed.includes(trackId)) { feedback('Arm a track to record into it'); return false }
  const running = takes.get(trackId)
  // An overdub stops here; a take into a slot ends at the next bar, where the new one starts.
  if (running?.kind === 'overdub') finish(running, beatNow())
  else if (running) endTake(trackId)
  const bars = useRecordSettings.getState().fixedBars
  const clip = createClip(`Clip ${scene + 1}`, bars ? bars * BAR : MAX_CLIP_BEATS)
  const take = newTake('slot', trackId, clip.id, scene)
  commitTake(take, (project) => setClipAt(project, trackId, scene, clip))
  takes.set(trackId, take)
  publish()
  launch(trackId, clip.id)
  recording()
  return true
}

/**
 * Ends a track's take at the next bar at least a quarter beat ahead (the slot pressed again), and at least a bar after
 * its start. The clip's length is set at once.
 */
export const endTake = (trackId: string): void => {
  const take = takes.get(trackId)
  if (!take || take.kind !== 'slot' || take.state === 'ending') return
  const now = beatNow()
  if (take.start === undefined) { take.endAsked = now; take.state = 'ending'; publish(); return }
  setEnd(take, nextBar(now, END_MARGIN))
}

/**
 * Ends every take now, at the bar after `beat` (the transport stopping): held notes are closed at `beat`. A take
 * stopped during its count-in never started: the empty clip made for it goes, in the same undo step.
 */
export const stopTakes = (beat = beatNow()): void => {
  const countingIn = useStatusStore.getState().status?.countIn !== undefined
  for (const take of [...takes.values()]) {
    if (take.kind === 'region' && take.state === 'queued') { drop(take, countingIn ? 'Count-in stopped: nothing recorded' : undefined); continue }
    if (countingIn && take.kind === 'slot' && take.start === undefined) removeEmptyClip(take)
    finish(take, Math.min(take.end ?? Infinity, nextBar(beat)), countingIn && take.start === undefined ? 'Count-in stopped: nothing recorded' : undefined, beat)
  }
  forgetSince()
}

const removeEmptyClip = (take: Take) => {
  const clip = clipOf(useProjectStore.getState().project, take)
  if (clip && clip.notes.length === 0 && take.epoch === useProjectStore.getState().documentEpoch) commitTake(take, (project) => setClipAt(project, take.trackId, take.scene, null))
}

/**
 * How many bars to count in before a start: the count-in set, from a stopped transport that isn't counting in already,
 * when the start records. It does when ● Rec is on, or when it launches a slot take's clip (`start`).
 */
export const countInBars = (start?: { readonly trackId: string; readonly clipId: string }): number => {
  const bars = useRecordSettings.getState().countInBars
  const status = useStatusStore.getState().status
  if (!bars || status?.playing || status?.countIn) return 0
  const take = start && takes.get(start.trackId)
  const slot = take?.kind === 'slot' && take.clipId === start!.clipId && take.start === undefined
  return useRecordStore.getState().rec || slot ? bars : 0
}

/** Ends every take as of now: before undo and redo, so the take is whole when it is undone. */
export const endTakesNow = (): void => {
  const now = beatNow()
  for (const take of [...takes.values()]) finish(take, Math.min(take.end ?? Infinity, nextBar(now)), undefined, now)
}

/** Drops every take unwritten and disarms everything: a new document. */
export const cancelRecords = (): void => {
  takes.clear()
  publish()
  forgetSince()
  blocked.clear()
  passes.clear()
  useRecordStore.setState({ armed: [], rec: false, feedback: '' })
}

/**
 * A note-on or note-off as the MIDI adapter passes it: its beat is undefined while the transport is stopped. `lap` and
 * `run` say which loop pass and which run of the transport it was in (`ClockPosition`); without them, the current ones.
 */
type When = { readonly beat: number | undefined; readonly lap?: number; readonly run?: number }
export type RecordedNote =
  | ({ readonly kind: 'on'; readonly source: string; readonly channel: number; readonly pitch: number; readonly velocity: number } & When)
  | ({ readonly kind: 'off'; readonly source: string; readonly channel: number; readonly pitch: number } & When)

/** Adds an event to a take: an arrangement take places it in take time, or holds it until it knows its run. */
const addEvent = (take: Take, event: TakeEvent, lap: number | undefined, run: number | undefined) => {
  if (take.region) { regionEvent(take, event, lap ?? take.region.lastLap, run); return }
  take.events.push(event)
  writeFinished(take)
}

/** A note-on or note-off that reached an armed track. Dropped without a beat (the transport stopped) or a take. */
export const recordNote = (trackId: string, { lap, run, ...event }: RecordedNote): void => {
  const take = takes.get(trackId)
  if (!take || event.beat === undefined || take.epoch !== useProjectStore.getState().documentEpoch) return
  addEvent(take, { ...event, beat: event.beat }, lap, run)
}

/** The sustain pedal of a source and channel, for every take: it lengthens the notes it holds. */
export const recordPedal = (source: string, channel: number, down: boolean, at: number | ClockPosition | undefined): void => {
  if (at === undefined) return
  const { beat, lap, run } = typeof at === 'number' ? { beat: at, lap: undefined, run: undefined } : at
  for (const take of [...takes.values()]) addEvent(take, { beat, kind: 'pedal', source, channel, down }, lap, run)
}

/**
 * Follows the engine: a queued take starts when its clip plays (from its launch boundary), a take ends when the
 * transport passes its end, and one whose clip stopped or the transport with it ends there.
 */
export const reconcileRecords = (status: EngineStatus): void => {
  const previous = useStatusStore.getState().status
  if (!status.playing && !status.countIn) forgetSince()
  for (const take of [...takes.values()]) {
    if (takes.get(take.trackId) !== take) continue
    if (take.epoch !== useProjectStore.getState().documentEpoch) { drop(take); continue }
    if (take.region) { reconcileRegion(take, status, previous); continue }
    const launcher = status.tracks[take.trackId]
    const waiting = launcher?.queued === take.clipId || launcher?.playingClipId === take.clipId
    if (waiting) take.seen = true
    // A status sent before the engine had the launch says nothing yet about the take.
    const gone = !waiting && (take.seen || Date.now() - take.openedAt > LAUNCH_WAIT_MS)
    if (!status.playing) {
      if (take.start !== undefined) stopTakes(previous?.beat ?? status.beat)
      else if (gone) drop(take, take.kind === 'slot' ? 'The take ended before it started' : undefined)
      continue
    }
    if (take.kind === 'overdub') { reconcileOverdub(take, status, previous, gone); continue }
    if (take.start === undefined) {
      if (launcher?.playingClipId === take.clipId && launcher.startBeat !== null) {
        take.start = launcher.startBeat
        take.state = take.endAsked === undefined ? 'recording' : 'ending'
        const bars = useRecordSettings.getState().fixedBars
        const clip = clipOf(useProjectStore.getState().project, take)
        take.end = take.start + (clip?.lengthBeats ?? (bars ? bars * BAR : MAX_CLIP_BEATS))
        take.limit = !bars
        if (take.endAsked !== undefined) setEnd(take, nextBar(take.endAsked, END_MARGIN))
        publish()
        writeFinished(take)
      } else if (gone) drop(take, 'The take ended before it started')
      continue
    }
    if (launcher?.playingClipId !== take.clipId) {
      // Stopped (■ on the track) or replaced by another clip at a boundary: the take ends there.
      const boundary = launcher?.stopBeat ?? launcher?.startBeat ?? nextBar(previous?.beat ?? status.beat)
      finish(take, Math.min(take.end ?? Infinity, nextBar(boundary)), undefined, boundary)
      continue
    }
    if (take.end !== undefined && status.beat >= take.end - EPSILON) {
      const end = take.end
      finish(take, end, take.state === 'recording' && take.limit ? '64 bars reached: the take ended' : undefined)
      // With ● Rec on, the clip goes on overdubbing from where the take ended, keeping what was played around it.
      if (overdubbing(take.trackId, status) && launcher.startBeat !== null) {
        const next = openOverdub(take.trackId, take.clipId, [...take.events])
        if (next) startOverdub(next, launcher.startBeat, end, false)
      }
    }
  }
  openOverdubs(status)
  openRegionTakes(status)
}

/** Whether a track overdubs now: ● Rec on, the track armed, and the Session playing (or counting in). */
const overdubbing = (trackId: string, status: EngineStatus) =>
  useRecordStore.getState().rec && useRecordStore.getState().armed.includes(trackId) && status.mode === 'session' && (status.playing || status.countIn !== undefined)

/** Follows an overdub's clip: it starts when the clip plays, and ends when the clip stops, is relaunched or changes length. */
const reconcileOverdub = (take: Take, status: EngineStatus, previous: EngineStatus | null, gone: boolean) => {
  const launcher = status.tracks[take.trackId]
  if (status.mode !== 'session') { finish(take, previous?.beat ?? status.beat); return }
  if (take.start === undefined) {
    if (launcher?.playingClipId === take.clipId && launcher.startBeat !== null) startOverdub(take, launcher.startBeat, sinceFor(take.trackId))
    else if (gone) drop(take)
    return
  }
  const clip = clipOf(useProjectStore.getState().project, take)
  if (!clip) { drop(take); return }
  if (launcher?.playingClipId !== take.clipId || launcher.startBeat !== take.loop!.anchor) {
    // Stopped, replaced, or relaunched at a boundary: the take ends there, and a clip playing from it goes on with
    // what was played around it.
    const boundary = launcher?.playingClipId ? (launcher.startBeat ?? status.beat) : (launcher?.stopBeat ?? previous?.beat ?? status.beat)
    finish(take, boundary)
    if (launcher?.playingClipId && launcher.startBeat !== null && overdubbing(take.trackId, status)) {
      const next = openOverdub(take.trackId, launcher.playingClipId, [...take.events])
      if (next) startOverdub(next, launcher.startBeat, boundary, false)
    }
    return
  }
  // A new length moves where the passes fall: this take ends, and the next one counts from the new length.
  if (clip.lengthBeats !== take.loop!.length) finish(take, beatNow())
}

/** Opens an overdub for each armed track with a clip playing or queued, while ● Rec is on. */
const openOverdubs = (status: EngineStatus) => {
  if (!useRecordStore.getState().rec) return
  for (const trackId of useRecordStore.getState().armed) {
    if (takes.has(trackId) || !overdubbing(trackId, status)) continue
    const launcher = status.tracks[trackId]
    if (status.playing && launcher?.playingClipId && launcher.startBeat !== null) {
      const take = openOverdub(trackId, launcher.playingClipId)
      if (take) startOverdub(take, launcher.startBeat, sinceFor(trackId))
    } else if (launcher?.queued) {
      if (openOverdub(trackId, launcher.queued)) { publish(); recording() }
    }
  }
}

/** Opens what ● Rec or an arm should open now, by the last status. */
const reconcileNow = () => {
  const status = useStatusStore.getState().status
  if (status) { openOverdubs(status); openRegionTakes(status) }
}

// Arrangement takes: with ● Rec on, the arrangement playing records every armed track into new regions.

/** Tracks that get no new arrangement take on their own until ● Rec, ▶ or the arm is pressed again. */
const blocked = new Set<string>()
/** What each pass with arrangement takes recorded: its longest take in bars, and each track's last region. */
const passes = new Map<string, { bars: number; readonly tracks: Map<string, string> }>()

const floorBar = (beat: number) => Math.floor((beat + EPSILON) / BAR) * BAR
/** The loop brace as a key, '' while it is off: a change ends the arrangement takes. */
const braceKeyOf = (project: Project) => {
  const loop = project.arrangementLoop
  return loop?.enabled ? `${loop.from}:${loop.to}` : ''
}
const braceLength = (r: RegionTake) => (r.brace ? r.brace.to - r.brace.from : 0)
/**
 * A beat on the clock in the take's own time, which only goes forward: a count-in's negative beats count back from
 * where ▶ played from, and with the brace, each loop pass adds its length.
 */
const takeTime = (r: RegionTake, beat: number, lap: number) => (beat < 0 ? r.from + beat : beat + lap * braceLength(r))

const regionView = (r: RegionTake) => {
  const made = r.segments.filter((id): id is string => id !== undefined)
  const last = made.length ? r.mine.get(made.at(-1)!) : undefined
  return { regions: made, outlineFrom: last ? last.startBeat + last.content.lengthBeats : r.origin }
}

/** Once a take has looped, its region is the brace, from the bar recording began in when that is before it. */
const markLooped = (r: RegionTake) => {
  if (r.looped || !r.brace) return
  r.looped = true
  r.origin = r.from < r.brace.from ? floorBar(r.from) : r.brace.from
  r.extent = r.brace.to
}

/** Grows where the regions end to the end of the bar `beat` is in: never past the brace's end or the timeline's. */
const growTo = (r: RegionTake, beat: number) => {
  if (r.looped) return
  const cap = Math.min(r.brace?.to ?? Infinity, MAX_TIMELINE_BEATS)
  r.extent = Math.min(cap, Math.max(r.extent, nextBar(beat), r.origin + BAR))
}

/**
 * Opens an arrangement take on a track, recording from `from` on the timeline. With `run` unknown (▶ or a seek), it
 * adopts the first run after `runAfter` and holds what is played until then (a count-in).
 */
const openRegion = (trackId: string, from: number, lap: number, run: number | undefined, runAfter: number, early: number): Take => {
  const project = useProjectStore.getState().project
  const loop = project.arrangementLoop
  const brace = loop?.enabled && from < loop.to - EPSILON ? { from: loop.from, to: loop.to } : undefined
  const origin = floorBar(from)
  const region: RegionTake = {
    run, runAfter, pending: [], from, origin, ...(brace && { brace }), braceKey: braceKeyOf(project), startLap: lap, looped: false,
    extent: Math.min(brace?.to ?? Infinity, MAX_TIMELINE_BEATS, Math.max(origin + BAR, nextBar(from))), segments: [], mine: new Map(), lastBeat: from, lastLap: lap,
  }
  const take: Take = { ...newTake('region', trackId, '', -1), region }
  take.start = takeTime(region, from, lap)
  take.early = early
  take.state = run === undefined ? 'queued' : 'recording'
  takes.set(trackId, take)
  if (!passes.has(take.pass)) passes.set(take.pass, { bars: 0, tracks: new Map() })
  return take
}

/**
 * ▶ on the arrangement, or a seek while it plays (`EngineControls.playArrangement`, before it sends): the arrangement
 * takes running end here, and with ● Rec on, every armed track gets a take from `fromBeat`, in the run the command
 * starts. A Session take on an armed track ends: the arrangement takes over.
 */
export const startArrangementTakes = (fromBeat: number): void => {
  const now = beatNow()
  for (const take of [...takes.values()]) if (take.kind === 'region') { if (take.state === 'queued') drop(take); else endRegion(take, now) }
  blocked.clear()
  const state = useRecordStore.getState()
  if (!state.rec) return
  if (state.armed.length === 0) { feedback('Armed tracks: none'); return }
  const runAfter = transportPosition()?.run ?? useStatusStore.getState().status?.run ?? -1
  for (const trackId of state.armed) {
    const running = takes.get(trackId)
    if (running) finish(running, now)
    openRegion(trackId, Math.max(0, fromBeat), 0, undefined, runAfter, EARLY_BEATS)
  }
  publish()
  recording()
}

/** Places an event in take time; a loop pass after the first means the take has looped. */
const placeEvent = (take: Take, event: TakeEvent, lap: number) => {
  const r = take.region!
  if (event.beat >= 0) { r.lastBeat = event.beat; r.lastLap = lap }
  if (r.brace && lap > r.startLap && event.beat >= 0) markLooped(r)
  take.events.push({ ...event, beat: takeTime(r, event.beat, lap) })
}

/** The take now knows its run: what was held for it is placed, what belonged to another run dropped. */
const adoptRun = (take: Take, run: number) => {
  const r = take.region!
  r.run = run
  for (const held of r.pending.splice(0)) if (held.run === undefined || held.run === run) placeEvent(take, held.event, held.lap)
}

/** An event for an arrangement take: held until the take knows its run, dropped when it is of another run. */
const regionEvent = (take: Take, event: TakeEvent, lap: number, run: number | undefined) => {
  const r = take.region!
  if (r.run === undefined) {
    if (run === undefined || run <= r.runAfter) { r.pending.push({ event, lap, ...(run !== undefined && { run }) }); return }
    adoptRun(take, run)
  }
  if (run !== undefined && run !== r.run) return
  placeEvent(take, event, lap)
  if (take.start === undefined) return
  if (!writeRegions(take)) { blocked.add(take.trackId); endRegion(take, r.lastBeat, `${MAX_TAKE_NOTES} notes reached: the take ended`) }
}

/** The take's notes, positioned from its first region's start: those that have ended, or all of them closed at `end`. */
const regionNotes = (take: Take, end?: number): Note[] => {
  const r = take.region!, start = take.start!
  const range = { id: take.id, start, early: take.early, ...(r.brace && { loop: { anchor: r.brace.from, length: braceLength(r), origin: r.origin } }) }
  const notes = end === undefined ? finishedNotes(take.events, range, Infinity) : takeNotes(take.events, { ...range, end })
  // Without the brace, take time is the timeline: notes come relative to the take's start.
  return r.brace ? notes : notes.map((note) => ({ ...note, start: note.start + start - r.origin }))
}

const sameNotes = (a: readonly Note[], b: readonly Note[]) =>
  a.length === b.length && a.every((n, i) => { const m = b[i]!; return n.id === m.id && n.pitch === m.pitch && n.start === m.start && n.duration === m.duration && n.velocity === m.velocity })

/**
 * Writes the take's regions whole, under its pass's key: each 64-bar segment from `origin` that has notes or already
 * has a region, as long as `extent` allows. A region appears with its first note. False when a region is full.
 */
const writeRegions = (take: Take, notes: readonly Note[] = regionNotes(take)): boolean => {
  const r = take.region!
  for (const note of notes) growTo(r, r.origin + note.start + note.duration)
  const project = useProjectStore.getState().project
  const segments = splitRegions(notes)
  const before = project.arrangement ?? []
  let arrangement = before
  let full = false
  for (let k = 0; k < Math.max(segments.length, r.segments.length); k++) {
    let list = segments[k] ?? []
    const id = r.segments[k]
    if (id === undefined && list.length === 0) continue
    if (list.length > MAX_TAKE_NOTES) { list = list.slice(0, MAX_TAKE_NOTES); full = true }
    const startBeat = r.origin + k * REGION_BEATS
    const lengthBeats = Math.min(REGION_BEATS, Math.max(MIN_CLIP_BEATS, r.extent - startBeat))
    if (id === undefined) {
      const region = createArrangementClip(take.trackId, startBeat, { ...createClip(trackName(take.trackId), lengthBeats), notes: list })
      arrangement = addArrangementClip(arrangement, region)
      r.segments[k] = region.id
      continue
    }
    const existing = arrangement.find((region) => region.id === id)
    if (!existing || !('notes' in existing.content)) continue
    const content = existing.content
    if (existing.startBeat === startBeat && content.lengthBeats === lengthBeats && sameNotes(content.notes, list)) continue
    arrangement = updateArrangementClip(arrangement, id, { startBeat, content: { ...content, lengthBeats, notes: list } })
  }
  if (arrangement !== before) {
    // Kept before the commit: the watch below compares the project's regions with these.
    for (const id of r.segments) { const region = id && arrangement.find((candidate) => candidate.id === id); if (region) r.mine.set(region.id, region) }
    commitTake(take, (current) => ({ ...current, arrangement }))
    publish()
  }
  return !full
}

/**
 * Ends an arrangement take where the transport is now (or at `beat`, with the last pass seen, when the clock has moved
 * on): held notes close there, every note is written, and the last region ends at the end of that bar, or at the
 * brace's end once it has looped. A take that never started records nothing.
 */
const endRegion = (take: Take, beat: number, message?: string) => {
  const r = take.region!
  takes.delete(take.trackId)
  publish()
  if (r.run === undefined || take.start === undefined || take.state === 'queued') { if (message) feedback(message); passEnded(take.pass, false); return }
  const position = transportPosition()
  const here = position && position.run === r.run && position.beat >= 0 ? position : { beat, lap: r.lastLap }
  if (r.brace && here.lap > r.startLap) markLooped(r)
  growTo(r, here.beat)
  const end = Math.max(take.start, takeTime(r, here.beat, here.lap))
  if (take.epoch === useProjectStore.getState().documentEpoch) writeRegions(take, regionNotes(take, end))
  const made = r.segments.filter((id): id is string => id !== undefined)
  const pass = passes.get(take.pass)
  if (pass && made.length) { pass.tracks.set(take.trackId, made.at(-1)!); pass.bars = Math.max(pass.bars, (r.extent - r.origin) / BAR) }
  if (message) feedback(message)
  passEnded(take.pass, !message)
}

/**
 * When the last arrangement take of a pass ends: says what it recorded, and selects the selected track's new region,
 * so the selected track, and the keyboard's routing with it, stays.
 */
const passEnded = (pass: string, report: boolean) => {
  const summary = passes.get(pass)
  if (!summary || [...takes.values()].some((take) => take.region && take.pass === pass)) return
  passes.delete(pass)
  const selected = useSelectionStore.getState().trackId
  const regionId = selected ? summary.tracks.get(selected) : undefined
  if (selected && regionId && useProjectStore.getState().project.arrangement?.some((region) => region.id === regionId)) useSelectionStore.getState().selectRegion(regionId, selected)
  if (!report) return
  if (takes.size) { recording(); return }
  const bars = Math.round(summary.bars * 100) / 100
  const names = [...summary.tracks.keys()].map(trackName).join(', ')
  feedback(summary.tracks.size ? `Recorded ${bars} bar${bars === 1 ? '' : 's'} on ${names}` : 'Nothing played: no region made')
}

/** Follows the engine for an arrangement take: its run, the playhead (growing the region), and what ends it. */
const reconcileRegion = (take: Take, status: EngineStatus, previous: EngineStatus | null) => {
  const r = take.region!
  if (r.run === undefined) {
    if (status.run !== undefined && status.run > r.runAfter) adoptRun(take, status.run)
    else {
      if (!status.countIn && Date.now() - take.openedAt > LAUNCH_WAIT_MS) drop(take, 'The take ended before it started')
      return
    }
  }
  // A status from before the take's run says nothing about it; one from a later run (a seek or a restart) ends it.
  if (status.run !== undefined && status.run < r.run!) return
  if (status.run !== undefined && status.run > r.run!) { endRegion(take, previous?.beat ?? r.lastBeat); return }
  if (!status.playing) {
    if (status.countIn) return
    if (take.state === 'queued') drop(take)
    else endRegion(take, previous?.beat ?? r.lastBeat)
    return
  }
  if (status.mode !== 'arrangement') { endRegion(take, previous?.beat ?? r.lastBeat); return }
  // A new brace moves where the passes fall: this take ends, and the next status opens another from here.
  if (braceKeyOf(useProjectStore.getState().project) !== r.braceKey) { endRegion(take, status.beat); return }
  if (take.state === 'queued') { take.state = 'recording'; publish(); recording() }
  r.lastBeat = status.beat
  r.lastLap = status.lap ?? r.lastLap
  if (status.beat >= MAX_TIMELINE_BEATS - EPSILON) { blocked.add(take.trackId); endRegion(take, status.beat, 'The timeline ends here: the take ended'); return }
  const origin = r.origin, extent = r.extent
  if (r.brace && r.lastLap > r.startLap) markLooped(r)
  growTo(r, status.beat)
  if ((r.origin !== origin || r.extent !== extent) && r.segments.length && !writeRegions(take)) {
    blocked.add(take.trackId)
    endRegion(take, status.beat, `${MAX_TAKE_NOTES} notes reached: the take ended`)
  }
}

/** Punches in: with ● Rec on and the arrangement playing, every armed track without a take records from now. */
const openRegionTakes = (status: EngineStatus) => {
  const state = useRecordStore.getState()
  if (!state.rec || !status.playing || status.mode !== 'arrangement') return
  let opened = false
  for (const trackId of state.armed) {
    if (takes.has(trackId) || blocked.has(trackId)) continue
    const at = transportPosition() ?? { beat: status.beat, lap: status.lap ?? 0, run: status.run ?? 0 }
    openRegion(trackId, at.beat, at.lap, at.run, at.run - 1, 0)
    opened = true
  }
  if (opened) { publish(); recording() }
}

/** Whether a region is being recorded into: the view draws it red and won't move, resize or delete it. */
export const isRecordingRegion = (regionId: string): boolean => [...takes.values()].some((take) => take.region?.segments.includes(regionId))

/** *Stop recording* on a region: its track's take ends now, and no new one opens on it until ● Rec, ▶ or the arm. */
export const stopRecordingRegion = (regionId: string): void => {
  const take = [...takes.values()].find((candidate) => candidate.region?.segments.includes(regionId))
  if (!take) return
  blocked.add(take.trackId)
  endRegion(take, beatNow())
}

/** A region being recorded that something else changed or removed ends its take there, leaving the region as it is. */
const watchRegions = (project: Project) => {
  for (const take of [...takes.values()]) {
    const r = take.region
    if (!r) continue
    const changed = r.segments.find((id) => id !== undefined && project.arrangement?.find((region) => region.id === id) !== r.mine.get(id))
    if (changed === undefined) continue
    blocked.add(take.trackId)
    drop(take, project.arrangement?.some((region) => region.id === changed) ? 'The take ended: its region was changed' : 'The take ended: its region was removed')
  }
}

guardHistory(endTakesNow)

// A track removed drops out of the armed set, and a new document drops every take and disarms.
useProjectStore.subscribe((state, previous) => {
  if (state.documentEpoch !== previous.documentEpoch) { if (takes.size || useRecordStore.getState().armed.length) cancelRecords(); return }
  if (state.project.arrangement !== previous.project.arrangement) watchRegions(state.project)
  if (state.project.tracks === previous.project.tracks) return
  const armed = useRecordStore.getState().armed
  const kept = armed.filter((id) => state.project.tracks.some((t) => t.id === id && t.kind === 'instrument'))
  if (kept.length !== armed.length) useRecordStore.setState({ armed: kept })
  for (const take of [...takes.values()]) if (!state.project.tracks.some((t) => t.id === take.trackId)) drop(take)
})
