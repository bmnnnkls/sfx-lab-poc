/**
 * A MIDI message the app acts on; channels are 1 to 16 as musicians count them. Everything else (clock, program change,
 * sysex) is ignored.
 */
export type MidiMessage =
  | { readonly kind: 'noteOn'; readonly channel: number; readonly note: number; readonly velocity: number }
  | { readonly kind: 'noteOff'; readonly channel: number; readonly note: number }
  | { readonly kind: 'cc'; readonly channel: number; readonly cc: number; readonly value: number }
  /** The wheel, −1 to 1, 0 at rest. */
  | { readonly kind: 'pitchBend'; readonly channel: number; readonly value: number }
  /** Channel pressure (aftertouch), 0 to 1. */
  | { readonly kind: 'pressure'; readonly channel: number; readonly value: number }
  /** Polyphonic pressure on one key, 0 to 1. */
  | { readonly kind: 'polyPressure'; readonly channel: number; readonly note: number; readonly value: number }

/** Highest data byte: notes, velocities, controller numbers and values all run 0 to 127. */
export const MIDI_MAX = 127
/** The pitch wheel's 14-bit centre. */
const BEND_CENTRE = 8192

const isDataByte = (byte: number) => Number.isInteger(byte) && byte >= 0 && byte <= MIDI_MAX

/**
 * The 14-bit wheel position as −1 to 1: 8192 is 0, and the 8192 steps below and the 8191 above each reach their end,
 * so 0 and 16383 are exactly −1 and 1.
 */
const bendValue = (lsb: number, msb: number): number => {
  const raw = (msb << 7) | lsb
  return raw >= BEND_CENTRE ? (raw - BEND_CENTRE) / (BEND_CENTRE - 1) : (raw - BEND_CENTRE) / BEND_CENTRE
}

/**
 * Reads the bytes of one MIDI message (as Web MIDI delivers them: whole, so no running status). A note-on with velocity
 * 0 is a note-off, as the standard says; velocity and pressure come back as 0..1, the pitch wheel as −1..1. Undefined
 * for a message the app does not use or a malformed one.
 */
export const parseMidiMessage = (data: ArrayLike<number>): MidiMessage | undefined => {
  const status = data[0] ?? 0
  if (!Number.isInteger(status) || status < 0x80 || status > 0xff) return undefined
  const kind = status & 0xf0
  const channel = (status & 0x0f) + 1
  const length = kind === 0xd0 ? 2 : 3
  if (data.length < length) return undefined
  const first = data[1] ?? -1
  if (!isDataByte(first)) return undefined
  if (kind === 0xd0) return { kind: 'pressure', channel, value: first / MIDI_MAX }
  const second = data[2] ?? -1
  if (!isDataByte(second)) return undefined
  switch (kind) {
    case 0x90:
      return second === 0 ? { kind: 'noteOff', channel, note: first } : { kind: 'noteOn', channel, note: first, velocity: second / MIDI_MAX }
    case 0x80:
      return { kind: 'noteOff', channel, note: first }
    case 0xa0:
      return { kind: 'polyPressure', channel, note: first, value: second / MIDI_MAX }
    case 0xb0:
      return { kind: 'cc', channel, cc: first, value: second }
    case 0xe0:
      return { kind: 'pitchBend', channel, value: bendValue(first, second) }
    default:
      return undefined
  }
}

const signed = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}`

/** How a message reads in the app's status line: "Note C4 on ch 1", "CC 21 = 64 on ch 2", "Bend +0.42 on ch 1". */
export const describeMidiMessage = (message: MidiMessage, noteName: (note: number) => string): string => {
  switch (message.kind) {
    case 'noteOn':
      return `Note ${noteName(message.note)} on ch ${message.channel}`
    case 'noteOff':
      return `Note ${noteName(message.note)} off ch ${message.channel}`
    case 'cc':
      return `CC ${message.cc} = ${message.value} on ch ${message.channel}`
    case 'pitchBend':
      return `Bend ${signed(message.value)} on ch ${message.channel}`
    case 'pressure':
      return `Pressure ${Math.round(message.value * MIDI_MAX)} on ch ${message.channel}`
    case 'polyPressure':
      return `Pressure ${noteName(message.note)} ${Math.round(message.value * MIDI_MAX)} on ch ${message.channel}`
  }
}
