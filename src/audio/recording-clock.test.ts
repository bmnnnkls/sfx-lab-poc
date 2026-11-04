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
