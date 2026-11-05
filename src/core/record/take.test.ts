import { describe, expect, it } from 'vitest'
import { EARLY_BEATS, MIN_NOTE_BEATS, type TakeEvent, finishedNotes, splitRegions, takeNotes } from './take'

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

describe('takeNotes with a loop (overdub)', () => {
  // A 4-beat clip that started at beat 8; the overdub records from beat 8 too.
  const range = { id: 'take', start: 8, end: 40, loop: { anchor: 8, length: 4 } }
  it.each<[string, TakeEvent[], (number[])[], Partial<typeof range> & { early?: number }]>([
    ['places a note by its position in the pass', [on(13, 60), off(14, 60)], [[60, 1, 1]], {}],
    ['notes from pass 1 and pass 3 land in the one clip', [on(9, 60), off(9.5, 60), on(18.5, 62), off(19, 62)], [[60, 1, 0.5], [62, 2.5, 0.5]], {}],
    ['a note held across the end is cut at the clip end', [on(11, 60), off(13, 60)], [[60, 3, 1]], {}],
    ['a note sustained across the end is cut at the clip end', [pedal(10, true), on(11.5, 60), off(11.75, 60), pedal(14, false)], [[60, 3.5, 0.5]], {}],
    ['a note held when the take ends is closed there, inside the clip', [on(25, 60)], [[60, 1, 3]], { end: 28 }],
    ['an early note at the anchor counts as on its first beat', [on(8 - EARLY_BEATS / 2, 60), off(9, 60)], [[60, 0, 1]], {}],
    ['a punch-in in pass 2 keeps no earlier note', [on(13, 60), off(14, 60), on(14.5, 62), off(15, 62)], [[62, 2.5, 0.5]], { start: 14, early: 0 }],
    ['a note just under the end wraps to 0, not to the length', [on(12 - 1e-12, 60), off(13, 60)], [[60, 0, 1]], {}],
    ['a fractional length wraps by itself', [on(11, 60), off(11.25, 60), on(14, 62), off(14.25, 62)], [[60, 0.5, 0.25], [62, 1, 0.25]], { loop: { anchor: 8, length: 2.5 } }],
    ['a three-beat clip', [on(15.5, 60), off(16, 60)], [[60, 1.5, 0.5]], { loop: { anchor: 8, length: 3 } }],
    ['the shortest note at the very end stays inside the clip', [on(11.999, 60), off(11.9995, 60)], [[60, 3.999, 0.001]], {}],
  ])('%s', (_name, events, expected, over) => {
    expect(shape(takeNotes(events, { ...range, ...over }))).toEqual(expected)
  })

  it('finishedNotes places and cuts the same way', () => {
    const events = [on(11, 60), off(13, 60), on(13.5, 62)]
    expect(shape(finishedNotes(events, { id: 'take', start: 8, loop: { anchor: 8, length: 4 } }, 13.6))).toEqual([[60, 3, 1]])
  })
})

describe('takeNotes into an arrangement region (a loop brace)', () => {
  // The brace is beats 8 to 16; times are take time (beat + lap × 8), so pass 2 runs from 16 to 24.
  const brace = { anchor: 8, length: 8 }
  it.each<[string, TakeEvent[], (number[])[], { start: number; end?: number; early?: number; origin: number; noLoop?: boolean }]>([
    ['a lead-in before the brace keeps its place, from the region start', [on(5, 60), off(6, 60)], [[60, 1, 1]], { start: 4, origin: 4 }],
    ['passes 1 and 3 land on the brace by their place in it', [on(9, 60), off(9.5, 60), on(34, 62), off(34.5, 62)], [[60, 5, 0.5], [62, 6, 0.5]], { start: 4, origin: 4 }],
    ['a note held across the jump is cut at the brace end', [on(15, 60), off(17, 60)], [[60, 3, 1]], { start: 12, origin: 12 }],
    ['a lead-in note held into the brace is not cut at the brace start', [on(7, 60), off(9, 60)], [[60, 3, 2]], { start: 4, origin: 4 }],
    ['a punch-in in pass 3 (take time already two passes on)', [on(30, 60), off(31, 60), on(36, 62), off(37, 62)], [[62, 4, 1], [60, 6, 1]], { start: 29, early: 0, origin: 8 }],
    ['a brace that is not bar-aligned, with the region from the bar before it', [on(9.5, 60), off(10, 60), on(18, 62), off(18.5, 62)], [[60, 1.5, 0.5], [62, 2, 0.5]], { start: 9, origin: 8 }],
  ])('%s', (_name, events, expected, { start, end = 64, early, origin }) => {
    expect(shape(takeNotes(events, { id: 'take', start, end, ...(early !== undefined && { early }), loop: { ...brace, origin } }))).toEqual(expected)
  })

  it('a brace that is not bar-aligned wraps by its own length', () => {
    // The brace 8.5 to 12 (3.5 beats), the region from beat 8.
    const events = [on(13, 60), off(13.25, 60)] // pass 2 at 12 + 1 => 9.5 on the timeline
    expect(shape(takeNotes(events, { id: 'take', start: 9, end: 40, loop: { anchor: 8.5, length: 3.5, origin: 8 } }))).toEqual([[60, 1.5, 0.25]])
  })

  it('without an origin, a loop places notes as an overdub does', () => {
    const events = [on(9, 60), off(9.5, 60), on(18.5, 62), off(19, 62)]
    expect(takeNotes(events, { id: 'take', start: 8, end: 40, loop: { anchor: 8, length: 4 } })).toEqual(takeNotes(events, { id: 'take', start: 8, end: 40, loop: { anchor: 8, length: 4, origin: 8 } }))
  })
})

describe('splitRegions', () => {
  const note = (id: string, start: number, duration: number) => ({ id, pitch: 60, start, duration, velocity: 0.5 })
  const shaped = (regions: readonly (readonly { id: string; start: number; duration: number }[])[]) => regions.map((r) => r.map((n) => [n.id, +n.start.toFixed(6), +n.duration.toFixed(6)]))
  it('keeps notes inside one region as they are', () => {
    expect(shaped(splitRegions([note('a', 1, 1), note('b', 200, 4)]))).toEqual([[['a', 1, 1], ['b', 200, 4]]])
  })
  it('puts a later note in the next region, from its start', () => {
    expect(shaped(splitRegions([note('a', 1, 1), note('b', 300, 2)]))).toEqual([[['a', 1, 1]], [['b', 44, 2]]])
  })
  it('splits a note held across the split in two', () => {
    expect(shaped(splitRegions([note('a', 254, 4)]))).toEqual([[['a', 254, 2]], [['a~1', 0, 2]]])
  })
  it('a note held across two splits goes on in both', () => {
    expect(shaped(splitRegions([note('a', 255, 258)], 256))).toEqual([[['a', 255, 1]], [['a~1', 0, 256]], [['a~2', 0, 1]]])
  })
  it('a note ending exactly on the split stays whole', () => {
    expect(shaped(splitRegions([note('a', 252, 4)]))).toEqual([[['a', 252, 4]]])
  })
  it('leaves an empty region where nothing was played', () => {
    const regions = splitRegions([note('a', 1, 1), note('b', 520, 1)])
    expect(regions.map((r) => r.length)).toEqual([1, 0, 1])
  })
})
