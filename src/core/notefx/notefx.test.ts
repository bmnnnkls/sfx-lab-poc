import { describe, expect, it } from 'vitest'
import type { NoteEvent } from '../session'
import { NoteChain } from './chain'
import { findNoteEffect } from './registry'
import type { NoteEffect, NoteProcessor } from './types'

const on = (beat: number, pitch: number, velocity = 0.8): NoteEvent => ({ beat, kind: 'noteOn', pitch, velocity })
const off = (beat: number, pitch: number): NoteEvent => ({ beat, kind: 'noteOff', pitch })
const allOff = (beat: number): NoteEvent => ({ beat, kind: 'allOff' })

const make = (type: string, params: Record<string, number> = {}): NoteProcessor => {
  const processor = findNoteEffect(type)!.create()
  for (const [id, value] of Object.entries(params)) processor.setParam(id, value)
  return processor
}
const ons = (events: NoteEvent[]) => events.filter((event) => event.kind === 'noteOn') as Extract<NoteEvent, { kind: 'noteOn' }>[]
const summary = (events: NoteEvent[]) => events.map((e) => `${e.beat}:${e.kind === 'allOff' ? 'X' : (e.kind === 'noteOn' ? '+' : '-') + e.pitch}`)

const effect = (id: string, type: string, params: Record<string, number> = {}, bypassed = false): NoteEffect => ({ id, type, params, bypassed })

describe('transpose', () => {
  it('moves notes and their note-offs together', () => {
    const transpose = make('transpose', { semitones: 5 })
    expect(summary(transpose.process([on(0, 60), off(1, 60)], 0, 4))).toEqual(['0:+65', '1:-65'])
  })

  it('ends the note that was started even if the knob moved while it was held', () => {
    const transpose = make('transpose', { semitones: 5 })
    transpose.process([on(0, 60)], 0, 1)
    transpose.setParam('semitones', -12)
    expect(summary(transpose.process([off(1, 60)], 1, 2))).toEqual(['1:-65'])
  })

  it('drops notes that would leave the MIDI range', () => {
    expect(make('transpose', { semitones: 24 }).process([on(0, 120)], 0, 1)).toEqual([])
  })

  it('passes "all off" through and forgets what was sounding', () => {
    const transpose = make('transpose', { semitones: 7 })
    transpose.process([on(0, 60)], 0, 1)
    expect(transpose.process([allOff(1)], 1, 2)).toEqual([allOff(1)])
    expect(summary(transpose.process([off(2, 60)], 2, 3))).toEqual(['2:-60']) // unknown: left as is, harmless
  })
})

describe('scale lock', () => {
  const lock = (params: Record<string, number>) => make('scaleLock', params)
  const snapped = (p: NoteProcessor, pitch: number) => ons(p.process([on(0, pitch)], 0, 1))[0]!.pitch

  it('moves notes that are not in the scale to the nearest one that is', () => {
    const cMinor = lock({ root: 0, scale: 1 })
    expect(snapped(cMinor, 64)).toBe(63) // E -> Eb
    expect(snapped(cMinor, 69)).toBe(68) // A -> Ab
    expect(snapped(cMinor, 60)).toBe(60) // C stays
    expect(snapped(cMinor, 70)).toBe(70) // Bb stays
  })

  it('a tie goes down', () => {
    expect(snapped(lock({ root: 0, scale: 0 }), 61)).toBe(60) // C# between C and D in C major
  })

  it('follows the root', () => {
    const dMajor = lock({ root: 2, scale: 0 })
    expect(snapped(dMajor, 60)).toBe(59) // C is not in D major (C#); tie between B and C#: down
    expect(snapped(dMajor, 66)).toBe(66) // F# is
  })
})

describe('chord and velocity', () => {
  it('a chord plays every note and releases every note', () => {
    const chord = make('chord', { chord: 2 }) // major
    const out = chord.process([on(0, 60), off(2, 60)], 0, 4)
    expect(summary(out)).toEqual(['0:+60', '0:+64', '0:+67', '2:-60', '2:-64', '2:-67'])
  })

  it('velocity scales and offsets, and stays in range', () => {
    const velocity = make('velocity', { scale: 0.5, offset: 0.1 })
    expect(ons(velocity.process([on(0, 60, 0.8)], 0, 1))[0]!.velocity).toBeCloseTo(0.5)
    const loud = make('velocity', { scale: 2, offset: 0.5 })
    expect(ons(loud.process([on(0, 60, 0.9)], 0, 1))[0]!.velocity).toBe(1)
    const quiet = make('velocity', { scale: 0, offset: -1 })
    expect(ons(quiet.process([on(0, 60, 0.9)], 0, 1))[0]!.velocity).toBeGreaterThan(0)
  })
})

describe('arpeggiator', () => {
  const chord = [on(0, 60), on(0, 64), on(0, 67)]
  const arp = (params: Record<string, number> = {}) => make('arpeggiator', { rate: 1, gate: 0.5, ...params })
  const pitches = (events: NoteEvent[]) => ons(events).map((e) => e.pitch)
  const beats = (events: NoteEvent[]) => ons(events).map((e) => e.beat)

  it('steps through a held chord on the grid, lowest note first', () => {
    const out = arp().process(chord, 0, 2)
    expect(pitches(out)).toEqual([60, 64, 67, 60])
    expect(beats(out)).toEqual([0, 0.5, 1, 1.5])
  })

  it('each note lasts the gate fraction of a step', () => {
    const out = arp({ gate: 0.5 }).process(chord, 0, 1)
    expect(summary(out)).toEqual(['0:+60', '0.25:-60', '0.5:+64', '0.75:-64'])
  })

  it('down, up-down and as-played orders', () => {
    expect(pitches(arp({ pattern: 1 }).process(chord, 0, 2))).toEqual([67, 64, 60, 67])
    expect(pitches(arp({ pattern: 2 }).process(chord, 0, 3))).toEqual([60, 64, 67, 64, 60, 64])
    const played = arp({ pattern: 3 }).process([on(0, 67), on(0, 60), on(0, 64)], 0, 1.5)
    expect(pitches(played)).toEqual([67, 60, 64])
  })

  it('octaves extend the sequence upwards', () => {
    expect(pitches(arp({ octaves: 2 }).process(chord, 0, 3.5))).toEqual([60, 64, 67, 72, 76, 79, 60])
  })

  it('starts on the next grid line when the chord begins between steps', () => {
    const out = arp().process([on(0.3, 60)], 0, 2)
    expect(beats(out)).toEqual([0.5, 1, 1.5])
  })

  it('a chord that starts on a step is heard on that step, with every note in it', () => {
    const out = arp({ pattern: 2 }).process([on(1, 60), on(1, 64)], 0, 2)
    expect(pitches(out)).toEqual([60, 64])
    expect(beats(out)).toEqual([1, 1.5])
  })

  it('stops stepping when the chord is released, but the last note still ends on time', () => {
    const p = arp({ gate: 0.5 })
    const first = p.process([...chord], 0, 1.2)
    const second = p.process([off(1.2, 60), off(1.2, 64), off(1.2, 67)], 1.2, 3)
    expect(ons(second)).toEqual([])
    expect(summary(first).concat(summary(second)).filter((e) => e.includes('-'))).toContain('1.25:-67')
  })

  it('gives the same notes whether processed in one call or many', () => {
    const whole = arp({ pattern: 2 }).process(chord, 0, 4)
    const p = arp({ pattern: 2 })
    const parts = [0, 0.7, 1.3, 2, 2.6, 4].slice(0, -1).flatMap((from, i) => {
      const to = [0, 0.7, 1.3, 2, 2.6, 4][i + 1]!
      return p.process(i === 0 ? chord : [], from, to)
    })
    expect(summary(parts)).toEqual(summary(whole))
  })

  it('"all off" silences the arpeggio at once and cancels pending note-offs', () => {
    const p = arp({ gate: 1 })
    p.process(chord, 0, 0.7)
    const out = p.process([allOff(0.7)], 0.7, 2)
    expect(summary(out)).toEqual(['0.7:X'])
  })

  it('a new rate re-aligns to the new grid', () => {
    const p = arp({ rate: 1 })
    p.process(chord, 0, 0.5)
    p.setParam('rate', 2) // 1/16
    expect(beats(p.process([], 0.5, 1))).toEqual([0.5, 0.75])
  })

  it('random order is reproducible and only uses held notes', () => {
    const run = () => pitches(arp({ pattern: 4, rate: 3 }).process(chord, 0, 4))
    expect(run()).toEqual(run())
    expect(run().every((pitch) => [60, 64, 67].includes(pitch))).toBe(true)
    expect(new Set(run()).size).toBeGreaterThan(1)
  })

  it('a new chord starts the pattern over', () => {
    const p = arp()
    p.process(chord, 0, 1.2)
    p.process([off(1.4, 60), off(1.4, 64), off(1.4, 67)], 1.2, 1.5)
    expect(pitches(p.process([on(2, 62), on(2, 65)], 1.5, 3))).toEqual([62, 65])
  })
})

describe('echo', () => {
  it('follows each note with quieter repeats on the grid', () => {
    const echo = make('echo', { time: 1, repeats: 3, decay: 0.5 })
    const out = echo.process([on(0, 60, 0.8)], 0, 4)
    expect(ons(out).map((e) => [e.beat, e.velocity])).toEqual([
      [0, 0.8],
      [0.5, 0.4],
      [1, 0.2],
      [1.5, 0.1],
    ])
  })

  it('repeats that fall in a later range come out then', () => {
    const echo = make('echo', { time: 1, repeats: 2, decay: 0.5 })
    expect(ons(echo.process([on(0, 60)], 0, 0.6)).map((e) => e.beat)).toEqual([0, 0.5])
    expect(ons(echo.process([], 0.6, 2)).map((e) => e.beat)).toEqual([1])
  })

  it('"all off" cancels repeats still to come', () => {
    const echo = make('echo', { time: 1, repeats: 4, decay: 0.9 })
    echo.process([on(0, 60)], 0, 0.1)
    const out = echo.process([allOff(0.2)], 0.1, 5)
    expect(out).toEqual([allOff(0.2)])
  })
})

describe('NoteChain', () => {
  it('gives the same events however the time is cut into ranges', () => {
    const input = [on(0, 57), on(0, 61), on(0, 64), off(3.5, 57), off(3.5, 61), off(3.5, 64)]
    const effects = [effect('a', 'arpeggiator', { pattern: 4, rate: 2 }), effect('b', 'echo')]
    const run = (cuts: number[]) => {
      const chain = new NoteChain()
      chain.sync(effects)
      return cuts.slice(0, -1).flatMap((from, i) => {
        const to = cuts[i + 1]!
        return summary(chain.process(input.filter((e) => e.beat >= from && e.beat < to), from, to))
      })
    }
    const fine = Array.from({ length: 65 }, (_, i) => i * 0.0625)
    expect(run(fine)).toEqual(run([0, 1, 2, 3, 4]))
    expect(run(fine)).toEqual(run([0, 0.37, 1.91, 2.5, 4]))
    expect(run(fine).length).toBeGreaterThan(40)
  })

  it('with no effects hands back the very same events', () => {
    const chain = new NoteChain()
    chain.sync([])
    const input = [on(0, 60)]
    expect(chain.process(input, 0, 1)).toBe(input)
  })

  it('applies effects in order', () => {
    const chain = new NoteChain()
    chain.sync([effect('a', 'transpose', { semitones: 1 }), effect('b', 'scaleLock', { root: 0, scale: 0 })])
    chain.process([], 0, 0) // consume the start-up all-off
    expect(summary(chain.process([on(0, 60)], 0, 1))).toEqual(['0:+60']) // 61 snaps back down to 60 (tie goes down)

    const reversed = new NoteChain()
    reversed.sync([effect('b', 'scaleLock', { root: 0, scale: 0 }), effect('a', 'transpose', { semitones: 1 })])
    reversed.process([], 0, 0)
    expect(summary(reversed.process([on(0, 60)], 0, 1))).toEqual(['0:+61'])
  })

  it('turning a knob keeps the running state, so an arpeggio does not restart', () => {
    const chain = new NoteChain()
    const base = effect('arp', 'arpeggiator', { rate: 1, gate: 0.5 })
    chain.sync([base])
    const first = chain.process([on(0, 60), on(0, 64), on(0, 67)], 0, 1)
    expect(ons(first).map((e) => e.pitch)).toEqual([60, 64])
    chain.sync([{ ...base, params: { ...base.params, gate: 0.9 } }])
    const second = chain.process([], 1, 2)
    expect(ons(second).map((e) => e.pitch)).toEqual([67, 60]) // carried on from where it was
  })

  it('adding or removing an effect restarts and silences, so nothing is left hanging', () => {
    const chain = new NoteChain()
    chain.sync([effect('a', 'transpose', { semitones: 2 })])
    chain.process([on(0, 60)], 0, 1)
    chain.sync([effect('a', 'transpose', { semitones: 2 }), effect('b', 'chord')])
    const out = chain.process([], 1, 2)
    expect(out[0]).toEqual(allOff(1))
    expect(chain.process([], 2, 3)).toEqual([]) // only once
  })

  it('a bypassed effect lets notes through unchanged', () => {
    const chain = new NoteChain()
    chain.sync([effect('a', 'transpose', { semitones: 7 }, true)])
    chain.process([], 0, 0)
    expect(summary(chain.process([on(0, 60)], 0, 1))).toEqual(['0:+60'])
    expect(chain.isEmpty).toBe(true)
  })

  it('unknown effect types are ignored instead of breaking the chain', () => {
    const chain = new NoteChain()
    chain.sync([effect('x', 'nope'), effect('a', 'transpose', { semitones: 1 })])
    chain.process([], 0, 0)
    expect(summary(chain.process([on(0, 60)], 0, 1))).toEqual(['0:+61'])
  })
})
