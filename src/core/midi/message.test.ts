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
    expect(parseMidiMessage([0xe0, 0, 64])).toBeUndefined() // pitch bend
    expect(parseMidiMessage([0x90, 200, 10])).toBeUndefined()
    expect(parseMidiMessage([0x90, 60])).toBeUndefined()
  })

  it('describes a message for the status line', () => {
    const name = (note: number) => (note === 60 ? 'C4' : String(note))
    expect(describeMidiMessage({ kind: 'noteOn', channel: 1, note: 60, velocity: 1 }, name)).toBe('Note C4 on ch 1')
    expect(describeMidiMessage({ kind: 'cc', channel: 2, cc: 21, value: 64 }, name)).toBe('CC 21 = 64 on ch 2')
  })
})
