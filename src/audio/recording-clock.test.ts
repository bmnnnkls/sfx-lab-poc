import { expect, it } from 'vitest'
import { RecordingClock } from './recording-clock'
import type { EngineStatus } from '@core'
const status = (beat: number, tempo = 120, playing = true): EngineStatus => ({ beat, tempo, playing, mode: 'session', peak: 0, peaks: {}, tracks: {}, readouts: {} })
it('timestamps UI stalls in the audio clock, retaining tempo segments for delayed MIDI release', () => {
  const clock = new RecordingClock()
  clock.update(status(4), 10)
  expect(clock.beat(10.5)).toBe(5)
  clock.update(status(6, 60), 11)
  expect(clock.beat(12)).toBe(7)
  expect(clock.beat(10.8)).toBeCloseTo(5.6) // delayed inactivity timer, before tempo change
  clock.update(status(16, 60), 21)
  expect(clock.beat(21)).toBe(16)
  clock.update(status(0, 60, false), 22)
  expect(clock.beat(25)).toBeUndefined()
  clock.update(status(0, 60), 26)
  expect(clock.beat(27)).toBe(1)
  expect(clock.beat(10.8)).toBeUndefined() // stale callback from the previous run
})

const countingIn = (beat: number, tempo = 120): EngineStatus => ({ ...status(0, tempo, false), countIn: { barsLeft: Math.ceil(-beat / 4), beat } })

it('runs through a count-in at its negative beats, and on through the start', () => {
  const clock = new RecordingClock()
  clock.update(status(0, 120, false), 9)
  expect(clock.beat(9.5)).toBeUndefined()
  // A one-bar count-in from 10 s: beats −4 to 0 over 2 s at 120 BPM.
  clock.update(countingIn(-4), 10)
  expect(clock.beat(10)).toBe(-4)
  expect(clock.beat(11.875)).toBeCloseTo(-0.25)
  clock.update(countingIn(-2), 11)
  // The start, stamped at its own frame (the worklet's clock edge), carries on from 0.
  clock.update(status(0), 12)
  expect(clock.beat(12.5)).toBe(1)
  // Before the count-in there is still nothing.
  expect(clock.beat(9.9)).toBeUndefined()
})

it('jumps to an arrangement position at the start after a count-in', () => {
  const clock = new RecordingClock()
  clock.update(countingIn(-4), 10)
  clock.update(status(16), 12)
  expect(clock.beat(11.5)).toBeCloseTo(-1)
  expect(clock.beat(12.25)).toBeCloseTo(16.5)
})

it('a stop during a count-in leaves nothing after it', () => {
  const clock = new RecordingClock()
  clock.update(countingIn(-8), 10)
  clock.update(status(0, 120, false), 11)
  expect(clock.beat(11.5)).toBeUndefined()
  // A note stamped in the count-in, read after the stop, can't reach a later take either.
  expect(clock.beat(10.5)).toBeUndefined()
})

const at = (beat: number, run: number, lap = 0): EngineStatus => ({ ...status(beat), run, lap })

it('keeps the loop pass across a jump back, so a time before it reads the pass it was in', () => {
  const clock = new RecordingClock()
  // A brace from 8 to 12, playing from 8 at 10 s; the jump at 12 s (beat 12) goes back to 8 in pass 1.
  clock.update(at(8, 3), 10)
  clock.update(at(8, 3, 1), 12)
  expect(clock.position(11.5)).toEqual({ beat: 11, run: 3, lap: 0 })
  expect(clock.position(12.5)).toEqual({ beat: 9, run: 3, lap: 1 })
  expect(clock.beat(12.5)).toBe(9)
})

it('a seek starts a new run, even to the same beat', () => {
  const clock = new RecordingClock()
  clock.update(at(4, 1), 10)
  clock.update(at(6, 2), 11) // a seek to 6 at the very beat the old run reached
  expect(clock.position(10.5)).toEqual({ beat: 5, run: 1, lap: 0 })
  expect(clock.position(11.5)).toEqual({ beat: 7, run: 2, lap: 0 })
})

it('a count-in is part of the run it starts', () => {
  const clock = new RecordingClock()
  clock.update({ ...countingIn(-4), run: 5, lap: 0 }, 10)
  clock.update(at(16, 5), 12)
  expect(clock.position(11.5)).toEqual({ beat: -1, run: 5, lap: 0 })
  expect(clock.position(12.5)).toEqual({ beat: 17, run: 5, lap: 0 })
})
