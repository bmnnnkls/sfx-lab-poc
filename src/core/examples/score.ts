import { createRng } from '../dsp'
import type { Clip, Note } from '../project'

/**
 * Notes written as text, with a groove that is part of the writing: swing, a little timing wander and a velocity for every step.
 * Everything is deterministic (ids, and the "random" wander comes from a seed), so an example is the same project every time.
 */

const LETTERS: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** `"A1"`, `"C#3"`, `"Bb2"` or a number, as a MIDI pitch (C4 = 60, the piano roll's naming). */
export const pitchOf = (name: string): number => {
  if (/^\d+$/.test(name)) return Number(name)
  const match = /^([A-G])([#b]?)(-?\d)$/.exec(name)
  if (!match) throw new Error(`Not a note name: "${name}"`)
  const [, letter, accidental, octave] = match as unknown as [string, string, string, string]
  return (Number(octave) + 1) * 12 + (LETTERS[letter] as number) + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0)
}

export interface Groove {
  /** Where the second sixteenth of each pair lands: 50 is straight, 58 a loose tech-house shuffle, 67 triplets. */
  readonly swing?: number
  /** How far starts wander, in beats (0.006 is about 3 ms at 125 BPM). */
  readonly drift?: number
  /** How far velocities wander, as a part of the range. */
  readonly dynamics?: number
  readonly seed?: number
}

const NO_GROOVE: Groove = {}

/** The groove applied to one note: delayed if it sits on an odd grid slot, then nudged. `slot` counts steps of `step` beats. */
const grooved = (start: number, slot: number, step: number, velocity: number, groove: Groove, next: () => number): { start: number; velocity: number } => {
  const delay = slot % 2 === 1 ? ((groove.swing ?? 50) / 100 - 0.5) * 2 * step : 0
  const wander = (groove.drift ?? 0) * (next() * 2 - 1)
  const dynamics = (groove.dynamics ?? 0) * (next() * 2 - 1)
  return { start: Math.max(0, start + delay + wander), velocity: Math.min(1, Math.max(0.05, velocity + dynamics)) }
}

/** One note with a stable id; rounded so a saved project does not carry float dust. */
export const noteAt = (clipId: string, index: number, pitch: number, start: number, duration: number, velocity: number): Note => ({
  id: `${clipId}-n${index}`,
  pitch,
  start: Math.round(start * 1e6) / 1e6,
  duration: Math.round(duration * 1e6) / 1e6,
  velocity: Math.round(velocity * 1e3) / 1e3,
})

/** What each character of a drum pattern means: how hard the hit is. */
const HITS: Readonly<Record<string, number>> = { X: 1, x: 0.82, o: 0.62, g: 0.36 }

export interface DrumOptions extends Groove {
  /** Beats per character. Default 0.25: sixteenth notes. */
  readonly step?: number
  /** The pitch every hit plays (drum voices ignore it, tuned ones use it). Default C4. */
  readonly pitch?: number | readonly number[]
  /** How long a hit is held, in beats. Default: one step. */
  readonly length?: number
}

/**
 * A pattern of hits as text: `X` accent, `x` hit, `o` soft, `g` ghost, `.` rest; spaces and `|` are ignored so a bar can be
 * written as four groups. A list of pitches cycles through the hits (a tuned percussion line).
 */
export const drumNotes = (clipId: string, pattern: string, options: DrumOptions = NO_GROOVE): { notes: Note[]; beats: number } => {
  const step = options.step ?? 0.25
  const rng = createRng(options.seed ?? 1)
  const next = () => rng.next()
  const pitches: readonly number[] = typeof options.pitch === 'object' ? options.pitch : [options.pitch ?? 60]
  const cells = [...pattern].filter((char) => char !== ' ' && char !== '|')
  const notes: Note[] = []
  cells.forEach((char, slot) => {
    if (char === '.' || char === '-') return
    const level = HITS[char]
    if (level === undefined) throw new Error(`Unknown hit "${char}" in pattern "${pattern}"`)
    const placed = grooved(slot * step, slot, step, level, options, next)
    const pitch = pitches[notes.length % pitches.length] as number
    notes.push(noteAt(clipId, notes.length, pitch, placed.start, options.length ?? step, placed.velocity))
  })
  return { notes, beats: cells.length * step }
}

export interface LineOptions extends Groove {
  readonly step?: number
  /** Default gate as a part of a step, for a note with no explicit length. */
  readonly gate?: number
}

/**
 * A line of notes as text, one token per step: `A1` (a pitch name or number), `.` a rest, `A1:3` held for three steps, `A1@0.6` at
 * velocity 0.6, `A3+C4+E4` a chord. A held note covers the steps after it, which are written as rests.
 */
export const lineNotes = (clipId: string, text: string, options: LineOptions = NO_GROOVE): { notes: Note[]; beats: number } => {
  const step = options.step ?? 0.25
  const gate = options.gate ?? 0.9
  const rng = createRng(options.seed ?? 1)
  const next = () => rng.next()
  const tokens = text.split(/[\s|]+/).filter(Boolean)
  const notes: Note[] = []
  tokens.forEach((token, slot) => {
    if (token === '.') return
    const match = /^([^:@]+)(?::(\d+(?:\.\d+)?))?(?:@(\d*\.?\d+))?$/.exec(token)
    if (!match) throw new Error(`Bad token "${token}" in "${text}"`)
    const [, pitchesText, steps, velocity] = match as unknown as [string, string, string | undefined, string | undefined]
    const placed = grooved(slot * step, slot, step, velocity === undefined ? 0.85 : Number(velocity), options, next)
    const length = steps === undefined ? step * gate : Number(steps) * step - (options.drift ?? 0)
    for (const name of pitchesText.split('+')) notes.push(noteAt(clipId, notes.length, pitchOf(name), placed.start, length, placed.velocity))
  })
  return { notes, beats: tokens.length * step }
}

/** A clip from notes written as text. `beats` is the loop length; by default it is exactly what the text covers. */
export const clipOf = (id: string, name: string, written: { notes: Note[]; beats: number }, beats = written.beats): Clip => ({
  id,
  name,
  lengthBeats: beats,
  notes: written.notes.filter((entry) => entry.start < beats),
})

/** A clip of one note held for its whole length (what a self-playing patch needs to stay switched on). */
export const heldClip = (id: string, name: string, beats: number, pitch: number | string = 60, velocity = 0.9): Clip => ({
  id,
  name,
  lengthBeats: beats,
  notes: [noteAt(id, 0, typeof pitch === 'string' ? pitchOf(pitch) : pitch, 0, beats, velocity)],
})

/** Chords laid out in time: `[start beat, length in beats, "A2+E3+C4"]` each. */
export const chordNotes = (clipId: string, chords: ReadonlyArray<readonly [number, number, string]>, beats: number, velocity = 0.8): { notes: Note[]; beats: number } => {
  const notes: Note[] = []
  for (const [start, length, names] of chords) for (const name of names.split('+')) notes.push(noteAt(clipId, notes.length, pitchOf(name), start, length, velocity))
  return { notes, beats }
}
