import type { ExpressionControl } from '../midi'
import type { Note } from '../project'

/**
 * One thing a MIDI keyboard did during a take, at its beat on the transport (absolute beats, not the clip's). A take
 * keeps the events that reached one track; layered tracks each get their own copy.
 */
export type TakeEvent =
  | { readonly beat: number; readonly kind: 'on'; readonly source: string; readonly channel: number; readonly pitch: number; readonly velocity: number }
  | { readonly beat: number; readonly kind: 'off'; readonly source: string; readonly channel: number; readonly pitch: number }
  | { readonly beat: number; readonly kind: 'pedal'; readonly source: string; readonly channel: number; readonly down: boolean }
  | ExpressionEvent

/**
 * The wheel, pressure or a CC as it reached the track (`value` in the control's own range), with `at`, the message's
 * timestamp in ms, which a CC's span gap is measured on. `end`: no new value, the span open on that control ends here
 * (routing took the track away from the keyboard).
 */
export interface ExpressionEvent {
  readonly beat: number
  readonly kind: 'expression'
  readonly at: number
  readonly source: string
  readonly channel: number
  readonly control: ExpressionControl
  readonly value: number
  readonly end?: true
}

/**
 * Where the transport was when something was played: its beat, and the run and the loop pass it was in
 * (`EngineStatus.run` and `lap`). Within one run, `beat + lap × loop length` only goes forward.
 */
export interface ClockPosition {
  readonly beat: number
  readonly lap: number
  readonly run: number
}

/** How early a note may be played and still count as on the take's first beat: a sixteenth. */
export const EARLY_BEATS = 0.25
/** The most notes a take writes into a clip: as many as a clip holds (the file format's `LIMITS.notesPerClip`). */
export const MAX_TAKE_NOTES = 5000
/** The shortest note a take writes: a press and release inside one render quantum still makes a note. */
export const MIN_NOTE_BEATS = 1 / 128

export interface TakeRange {
  /** The take's id; note ids are made from it and a counter, so they stay the same across live writes. */
  readonly id: string
  /** The take's first beat, on the transport. Notes are returned relative to it. */
  readonly start: number
  /** Where the take ends, on the transport; Infinity while it is open. */
  readonly end?: number
  /** How early a note may start and count as at `start` (`EARLY_BEATS`). */
  readonly early?: number
  /**
   * Overdub: the notes go into a clip `length` beats long that started playing at `anchor`, so a note is placed at
   * `(on - anchor) mod length` and cut at the clip's end. Without it, notes are relative to `start` and nothing wraps.
   */
  readonly loop?: TakeLoop
}

export interface TakeLoop {
  /** Where the passes are counted from: an overdub's clip start, or the loop brace's start in the arrangement. */
  readonly anchor: number
  /** How long a pass is: the clip's length, or the brace's. */
  readonly length: number
  /**
   * Where positions are counted from, on the same axis as `anchor`: the anchor by default (a clip), or an arrangement
   * region's start, which may be before the brace (a lead-in) or anywhere in it.
   */
  readonly origin?: number
}

/** How long a region a take writes may be before it goes on in the next one: 64 bars (`MAX_CLIP_BEATS`). */
export const REGION_BEATS = 256

interface Paired {
  readonly index: number
  readonly pitch: number
  readonly velocity: number
  readonly on: number
  /** The beat it ended, or undefined while it is held or sustained. */
  readonly off: number | undefined
}

/** The note id of the take's `index`th note-on. */
export const takeNoteId = (takeId: string, index: number): string => `${takeId}:${index}`

/**
 * Pairs ons and offs per source, channel and pitch, in the order they came (a repeated pitch is two notes). A note
 * released while its source and channel's pedal is down ends when the pedal comes up, or when its pitch is played
 * again (so a clip never holds two of one pitch from one key).
 */
const pair = (events: readonly TakeEvent[]): Paired[] => {
  const notes: { index: number; pitch: number; velocity: number; on: number; off: number | undefined }[] = []
  const held = new Map<string, (typeof notes)[number][]>()
  const sustained = new Map<string, (typeof notes)[number][]>()
  const pedals = new Set<string>()
  let ons = 0
  // Sorted by beat, keeping arrival order for equal beats; the index is the arrival order, so ids never move.
  const ordered = events.map((event, order) => ({ event, order, index: event.kind === 'on' ? ons++ : -1 })).sort((a, b) => a.event.beat - b.event.beat || a.order - b.order)
  for (const { event, index } of ordered) {
    if (event.kind === 'expression') continue
    const channelKey = `${event.source}\u0000${event.channel}`
    if (event.kind === 'pedal') {
      if (event.down) pedals.add(channelKey)
      else {
        pedals.delete(channelKey)
        for (const note of sustained.get(channelKey) ?? []) note.off = event.beat
        sustained.delete(channelKey)
      }
      continue
    }
    const key = `${channelKey}\u0000${event.pitch}`
    if (event.kind === 'on') {
      const waiting = sustained.get(channelKey)
      if (waiting) for (const note of waiting.filter((n) => n.pitch === event.pitch)) { note.off = event.beat; waiting.splice(waiting.indexOf(note), 1) }
      const note = { index, pitch: event.pitch, velocity: event.velocity, on: event.beat, off: undefined }
      notes.push(note)
      held.set(key, [...(held.get(key) ?? []), note])
      continue
    }
    const note = held.get(key)?.shift()
    if (!note) continue
    if (held.get(key)?.length === 0) held.delete(key)
    if (pedals.has(channelKey)) sustained.set(channelKey, [...(sustained.get(channelKey) ?? []), note])
    else note.off = event.beat
  }
  return notes
}

const toNote = (note: Paired, { id, start, end = Infinity, early = EARLY_BEATS, loop }: TakeRange, close: number): Note | null => {
  if (note.on < start - early - 1e-9 || note.on >= end) return null
  const from = Math.max(note.on, start)
  const to = Math.min(note.off ?? close, end)
  const duration = Math.max(MIN_NOTE_BEATS, to - from)
  if (!loop || !(loop.length > 0)) return { id: takeNoteId(id, note.index), pitch: note.pitch, start: from - start, duration, velocity: note.velocity }
  const { anchor, length, origin = anchor } = loop
  // The first pass, and a lead-in before the anchor, keep their place; later passes wrap by the length. (Times only go
  // forward within a take, so a later pass is always at or past `anchor + length`.)
  let at = from - anchor
  if (at > length - 1e-9) {
    at %= length
    if (at > length - 1e-9) at = 0
  }
  // A note held across the loop's end stops at the pass's end: the part after the wrap isn't recorded.
  const room = length - at
  return { id: takeNoteId(id, note.index), pitch: note.pitch, start: at + (anchor - origin), duration: Math.min(duration, room), velocity: note.velocity }
}

const ordered = (notes: Note[]): Note[] => notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch)

/**
 * The notes a take made, relative to its start (or, with `loop`, placed in the clip by pass): a note held or sustained at `end` ends there; a note-on within `early`
 * before `start` starts at `start`, earlier ones are dropped, and so are notes starting at or after `end`.
 */
export const takeNotes = (events: readonly TakeEvent[], range: TakeRange & { readonly end: number }): Note[] =>
  ordered(pair(events).flatMap((note) => toNote(note, range, range.end) ?? []))

/** The notes whose end is known by `now`, for writing into the clip as they end. */
export const finishedNotes = (events: readonly TakeEvent[], range: TakeRange, now: number): Note[] =>
  ordered(pair(events).flatMap((note) => (note.off !== undefined && note.off <= now ? (toNote(note, range, note.off) ?? []) : [])))

/**
 * Cuts a take's notes (positions from the first region's start) into regions `every` beats long, one after another:
 * each region's notes relative to its own start. A note held across a split goes on in the next region, as a note of
 * the same pitch and velocity from its start, with the id `<id>~<n>`, so playback still holds it.
 */
export const splitRegions = (notes: readonly Note[], every = REGION_BEATS): Note[][] => {
  const regions: Note[][] = []
  const into = (index: number, note: Note) => (regions[index] ??= []).push(note)
  for (const note of notes) {
    let index = Math.max(0, Math.floor(note.start / every + 1e-9))
    let start = Math.max(0, note.start - index * every)
    let left = note.duration
    let part = 0
    while (left > 1e-9) {
      const duration = Math.min(left, every - start)
      into(index, { ...note, id: part ? `${note.id}~${part}` : note.id, start, duration: part ? Math.max(MIN_NOTE_BEATS, duration) : duration })
      left -= duration
      index++
      start = 0
      part++
    }
  }
  for (let i = 0; i < regions.length; i++) regions[i] = ordered(regions[i] ?? [])
  return regions
}
