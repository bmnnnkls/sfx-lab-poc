import { create } from 'zustand'
import { type Clip, type EngineStatus, type Note, type Project, type TakeEvent, type TakeLoop, EARLY_BEATS, MAX_CLIP_BEATS, MAX_TAKE_NOTES, commit, createClip, finishedNotes, sessionClipRef, setClipAt, setClipLength, setClipNotes, takeNotes } from '@core'
import { guardHistory, useProjectStore } from './project-store'
import { transportBeat } from './record-clock'
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
 * A take into a new clip in an empty slot (the slot's ●), or an overdub into a clip already playing on an armed track
 * while ● Rec is on.
 */
export type TakeKind = 'slot' | 'overdub'
/** What the view shows of a take: one per track at most. */
export interface TakeView {
  readonly id: string
  readonly kind: TakeKind
  readonly clipId: string
  readonly scene: number
  readonly state: TakeState
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

interface Take {
  readonly id: string
  readonly kind: TakeKind
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
      set({ armed: [...armed, trackId], feedback: takes.size ? get().feedback : get().rec ? recFeedback() : 'Press ● on an empty slot to record' })
      if (get().rec) reconcileNow()
      return
    }
    if (!armed.includes(trackId)) return
    const take = takes.get(trackId)
    if (take?.kind === 'overdub') finish(take, beatNow())
    else if (take) endTake(trackId)
    armedSince.delete(trackId)
    const rest = armed.filter((id) => id !== trackId)
    set({ armed: rest, ...(rest.length === 0 && takes.size === 0 && { feedback: get().rec ? recFeedback() : '' }) })
  },
  setRec: (on) => {
    if (on === get().rec) return
    if (on) {
      recSince = transportBeat() ?? -Infinity
      set({ rec: true })
      reconcileNow()
      feedback(recFeedback())
      return
    }
    set({ rec: false })
    const now = beatNow()
    for (const take of [...takes.values()]) if (take.kind === 'overdub') { if (take.start === undefined) drop(take); else finish(take, now) }
    feedback(takes.size ? recordingText() : '')
  },
}))

const feedback = (message: string) => useRecordStore.setState({ feedback: message })
const trackName = (trackId: string) => useProjectStore.getState().project.tracks.find((t) => t.id === trackId)?.name ?? 'a track'
const publish = () => {
  const views: Record<string, TakeView> = {}
  for (const take of takes.values()) views[take.trackId] = { id: take.id, kind: take.kind, clipId: take.clipId, scene: take.scene, state: take.state }
  useRecordStore.setState({ takes: views })
}
/** *Recording Bass*, *Overdubbing Lead*, or both. */
const recordingText = () => {
  const named = (kind: TakeKind) => [...takes.values()].filter((take) => take.kind === kind).map((take) => trackName(take.trackId))
  const slot = named('slot'), overdub = named('overdub')
  return [slot.length ? `Recording ${slot.join(', ')}` : '', overdub.length ? `Overdubbing ${overdub.join(', ')}` : ''].filter(Boolean).join(' · ')
}
const recording = () => { if (takes.size) feedback(recordingText()) }
/** What ● Rec says while it is on: who records, or why nothing does. */
const recFeedback = () => {
  if (useRecordStore.getState().armed.length === 0) return 'Armed tracks: none'
  if (useStatusStore.getState().status?.mode === 'arrangement') return "Recording into the Arrangement isn't available yet"
  return takes.size ? recordingText() : 'Launch a clip on an armed track to overdub'
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
  useProjectStore.setState({ project, history: commit(store.history, project, { key: `record:${take.id}`, now: Date.now(), mergeWindowMs: Infinity }) })
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

const newTake = (kind: TakeKind, trackId: string, clipId: string, scene: number, events: TakeEvent[] = []): Take =>
  ({ id: `take-${crypto.randomUUID()}`, kind, trackId, clipId, scene, epoch: useProjectStore.getState().documentEpoch, state: 'queued', early: EARLY_BEATS, events, openedAt: Date.now(), seen: false, written: new Set() })

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
  useRecordStore.setState({ armed: [], rec: false, feedback: '' })
}

/** A note-on or note-off as the MIDI adapter passes it: its beat is undefined while the transport is stopped. */
export type RecordedNote =
  | { readonly kind: 'on'; readonly source: string; readonly channel: number; readonly pitch: number; readonly velocity: number; readonly beat: number | undefined }
  | { readonly kind: 'off'; readonly source: string; readonly channel: number; readonly pitch: number; readonly beat: number | undefined }

/** A note-on or note-off that reached an armed track. Dropped without a beat (the transport stopped) or a take. */
export const recordNote = (trackId: string, event: RecordedNote): void => {
  const take = takes.get(trackId)
  if (!take || event.beat === undefined || take.epoch !== useProjectStore.getState().documentEpoch) return
  take.events.push({ ...event, beat: event.beat })
  writeFinished(take)
}

/** The sustain pedal of a source and channel, for every take: it lengthens the notes it holds. */
export const recordPedal = (source: string, channel: number, down: boolean, beat: number | undefined): void => {
  if (beat === undefined) return
  for (const take of [...takes.values()]) {
    take.events.push({ beat, kind: 'pedal', source, channel, down })
    writeFinished(take)
  }
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
  if (status) openOverdubs(status)
}

guardHistory(endTakesNow)

// A track removed drops out of the armed set, and a new document drops every take and disarms.
useProjectStore.subscribe((state, previous) => {
  if (state.documentEpoch !== previous.documentEpoch) { if (takes.size || useRecordStore.getState().armed.length) cancelRecords(); return }
  if (state.project.tracks === previous.project.tracks) return
  const armed = useRecordStore.getState().armed
  const kept = armed.filter((id) => state.project.tracks.some((t) => t.id === id && t.kind === 'instrument'))
  if (kept.length !== armed.length) useRecordStore.setState({ armed: kept })
  for (const take of [...takes.values()]) if (!state.project.tracks.some((t) => t.id === take.trackId)) drop(take)
})
