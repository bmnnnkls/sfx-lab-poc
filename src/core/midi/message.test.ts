import { describe, expect, it } from 'vitest'
import { describeMidiMessage, parseMidiMessage } from './message'

describe('parseMidiMessage', () => {
  it('reads note-on, note-off and CC, with channels counted from 1', () => {
    expect(parseMidiMessage([0x90, 60, 127])).toEqual({ kind: 'noteOn', channel: 1, note: 60, velocity: 1 })
    expect(parseMidiMessage([0x81, 61, 40])).toEqual({ kind: 'noteOff', channel: 2, note: 61 })
    expect(parseMidiMessage([0xbf, 21, 64])).toEqual({ kind: 'cc', channel: 16, cc: 21, value: 64 })
  })

  it('a note-on at velocity 0 is a note-off', () => {
    expect(parseMidiMessage([0x93, 64, 0])).toEqual({ kind: 'noteOff', channel: 4, note: 64 })
  })

  it('ignores what the app does not use, and malformed bytes', () => {
    expect(parseMidiMessage([0xf8])).toBeUndefined() // clock
    expect(parseMidiMessage([0xc0, 5])).toBeUndefined() // program change
    expect(parseMidiMessage([0x90, 200, 10])).toBeUndefined()
    expect(parseMidiMessage([0x90, 60])).toBeUndefined()
  })

  it.each([
    [0x190, 60, 127], [0x90, 60.5, 127], [0x90, 60, Number.NaN],
    [0x90, Number.POSITIVE_INFINITY, 127], [0x90, -1, 127], [0x90, 60, 128],
  ])('rejects non-byte input %j', (...bytes) => {
    expect(parseMidiMessage(bytes)).toBeUndefined()
  })

  it('reads the pitch wheel as -1 to 1, the LSB first', () => {
    expect(parseMidiMessage([0xe0, 0, 64])).toEqual({ kind: 'pitchBend', channel: 1, value: 0 })
    expect(parseMidiMessage([0xe1, 0, 0])).toEqual({ kind: 'pitchBend', channel: 2, value: -1 })
    expect(parseMidiMessage([0xe0, 127, 127])).toEqual({ kind: 'pitchBend', channel: 1, value: 1 })
    // 8192 + 1: the LSB carries the low seven bits.
    expect((parseMidiMessage([0xe0, 1, 64]) as { value: number }).value).toBeCloseTo(1 / 8191, 12)
    expect((parseMidiMessage([0xe0, 0, 32]) as { value: number }).value).toBeCloseTo(-0.5, 12)
  })

  it('reads channel pressure from two bytes and polyphonic pressure from three', () => {
    expect(parseMidiMessage([0xd2, 127])).toEqual({ kind: 'pressure', channel: 3, value: 1 })
    expect(parseMidiMessage([0xd0, 0])).toEqual({ kind: 'pressure', channel: 1, value: 0 })
    expect(parseMidiMessage([0xa0, 60, 127])).toEqual({ kind: 'polyPressure', channel: 1, note: 60, value: 1 })
    expect(parseMidiMessage([0xd0])).toBeUndefined()
    expect(parseMidiMessage([0xd0, 128])).toBeUndefined()
    expect(parseMidiMessage([0xa0, 60])).toBeUndefined()
    expect(parseMidiMessage([0xe0, 0])).toBeUndefined()
    // Two bytes are enough only for channel pressure.
    expect(parseMidiMessage([0xb0, 1])).toBeUndefined()
  })

  it('describes a message for the status line', () => {
    const name = (note: number) => (note === 60 ? 'C4' : String(note))
    expect(describeMidiMessage({ kind: 'noteOn', channel: 1, note: 60, velocity: 1 }, name)).toBe('Note C4 on ch 1')
    expect(describeMidiMessage({ kind: 'cc', channel: 2, cc: 21, value: 64 }, name)).toBe('CC 21 = 64 on ch 2')
    expect(describeMidiMessage({ kind: 'pitchBend', channel: 1, value: 0.42 }, name)).toBe('Bend +0.42 on ch 1')
    expect(describeMidiMessage({ kind: 'pitchBend', channel: 1, value: -1 }, name)).toBe('Bend −1.00 on ch 1')
    expect(describeMidiMessage({ kind: 'pressure', channel: 1, value: 80 / 127 }, name)).toBe('Pressure 80 on ch 1')
    expect(describeMidiMessage({ kind: 'polyPressure', channel: 1, note: 60, value: 80 / 127 }, name)).toBe('Pressure C4 80 on ch 1')
  })
})
