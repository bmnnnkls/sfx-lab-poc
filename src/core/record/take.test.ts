import { describe, expect, it } from 'vitest'
import { EARLY_BEATS, MIN_NOTE_BEATS, type TakeEvent, finishedNotes, takeNotes } from './take'

const on = (beat: number, pitch: number, velocity = 0.5, source = 'midi:a', channel = 0): TakeEvent => ({ beat, kind: 'on', source, channel, pitch, velocity })
const off = (beat: number, pitch: number, source = 'midi:a', channel = 0): TakeEvent => ({ beat, kind: 'off', source, channel, pitch })
const pedal = (beat: number, down: boolean, source = 'midi:a', channel = 0): TakeEvent => ({ beat, kind: 'pedal', source, channel, down })
/** [pitch, start, duration] of each note, rounded so tables read plainly. */
const shape = (notes: readonly { pitch: number; start: number; duration: number }[]) => notes.map((n) => [n.pitch, +n.start.toFixed(6), +n.duration.toFixed(6)])

describe('takeNotes', () => {
  const range = { id: 'take', start: 8, end: 16 }
  it.each<[string, TakeEvent[], (number[])[]]>([
    ['pairs an on with its off', [on(8, 60), off(9, 60)], [[60, 0, 1]]],
    ['places notes relative to the start', [on(10.5, 62), off(11, 62)], [[62, 2.5, 0.5]]],
    ['a repeated pitch is two notes, paired in order', [on(8, 60), on(9, 60), off(10, 60), off(11, 60)], [[60, 0, 2], [60, 1, 2]]],
    ['pairs per source and channel', [on(8, 60, 0.5, 'midi:a'), on(8, 60, 0.5, 'midi:b'), off(9, 60, 'midi:b'), off(10, 60, 'midi:a')], [[60, 0, 2], [60, 0, 1]]],
    ['an off with no on is ignored', [off(9, 60), on(10, 60), off(11, 60)], [[60, 2, 1]]],
    ['a note released under the pedal ends at its release', [pedal(8, true), on(9, 60), off(10, 60), pedal(12, false)], [[60, 1, 3]]],
    ['the pedal of another channel does not hold it', [pedal(8, true, 'midi:a', 1), on(9, 60), off(10, 60), pedal(12, false, 'midi:a', 1)], [[60, 1, 1]]],
    ['a note released before the pedal goes down is not held', [on(9, 60), off(10, 60), pedal(10.5, true), pedal(12, false)], [[60, 1, 1]]],
    ['a sustained note ends when its pitch is played again', [pedal(8, true), on(9, 60), off(9.5, 60), on(11, 60), off(11.5, 60), pedal(13, false)], [[60, 1, 2], [60, 3, 2]]],
    ['a note held at the end ends there', [on(14, 60)], [[60, 6, 2]]],
    ['a note sustained at the end ends there', [pedal(8, true), on(14, 60), off(15, 60)], [[60, 6, 2]]],
    ['a note released after the end is cut there', [on(15, 60), off(18, 60)], [[60, 7, 1]]],
    ['a note within a sixteenth early starts at the start', [on(8 - EARLY_BEATS / 2, 60), off(9, 60)], [[60, 0, 1]]],
    ['a note exactly a sixteenth early still counts', [on(8 - EARLY_BEATS, 60), off(9, 60)], [[60, 0, 1]]],
    ['an earlier note is dropped', [on(7.5, 60), off(9, 60)], []],
    ['a note starting at the end is dropped', [on(16, 60), off(17, 60)], []],
    ['a note shorter than 1/128 beat is lengthened', [on(9, 60), off(9.001, 60)], [[60, 1, +MIN_NOTE_BEATS.toFixed(6)]]],
    ['an early note released before the start is the shortest note', [on(7.9, 60), off(7.95, 60)], [[60, 0, +MIN_NOTE_BEATS.toFixed(6)]]],
    ['events out of order are sorted by beat', [off(10, 60), on(9, 60)], [[60, 1, 1]]],
  ])('%s', (_name, events, expected) => {
    expect(shape(takeNotes(events, range))).toEqual(expected)
  })

  it('keeps velocity as the parser gives it, 0..1', () => {
    expect(takeNotes([on(8, 60, 0.75), off(9, 60)], range)[0]!.velocity).toBe(0.75)
  })

  it('names notes by the take and the order their note-ons came in', () => {
    const events = [on(8, 60), on(9, 62), off(9.5, 62), off(10, 60)]
    expect(takeNotes(events, range).map((n) => n.id)).toEqual(['take:0', 'take:1'])
    // An event that arrives late (an earlier beat) does not rename the others.
    expect(takeNotes([...events, on(8.5, 64), off(9, 64)], range).map((n) => [n.id, n.pitch])).toEqual([['take:0', 60], ['take:2', 64], ['take:1', 62]])
  })
})

describe('finishedNotes', () => {
  const range = { id: 'take', start: 0 }
  it('returns only the notes whose end is known', () => {
    const events = [on(0, 60), off(1, 60), on(1, 62)]
    expect(shape(finishedNotes(events, range, 1.5))).toEqual([[60, 0, 1]])
  })
  it('holds back a note under the pedal until it comes up', () => {
    const events = [pedal(0, true), on(0, 60), off(1, 60)]
    expect(finishedNotes(events, range, 2)).toEqual([])
    expect(shape(finishedNotes([...events, pedal(3, false)], range, 3))).toEqual([[60, 0, 3]])
  })
  it('gives each note the id it will have in the finished take', () => {
    const events = [on(0, 60), off(1, 60), on(1, 62), off(2, 62)]
    expect(finishedNotes(events, range, 2).map((n) => n.id)).toEqual(takeNotes(events, { ...range, end: 4 }).map((n) => n.id))
  })
  it('cuts at the end once it is known', () => {
    expect(shape(finishedNotes([on(3, 60), off(5, 60)], { ...range, end: 4 }, 5))).toEqual([[60, 3, 1]])
  })
})
