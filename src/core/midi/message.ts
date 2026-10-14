/** A MIDI message the app acts on; channels are 1 to 16 as musicians count them. Everything else (clock, aftertouch, sysex) is ignored. */
export type MidiMessage =
  | { readonly kind: 'noteOn'; readonly channel: number; readonly note: number; readonly velocity: number }
  | { readonly kind: 'noteOff'; readonly channel: number; readonly note: number }
  | { readonly kind: 'cc'; readonly channel: number; readonly cc: number; readonly value: number }

/** Highest data byte: notes, velocities, controller numbers and values all run 0 to 127. */
export const MIDI_MAX = 127

/**
 * Reads the bytes of one MIDI message (as Web MIDI delivers them). A note-on with velocity 0 is a note-off, as the
 * standard says; velocity comes back as 0..1. Undefined for a message the app does not use or a malformed one.
 */
export const parseMidiMessage = (data: ArrayLike<number>): MidiMessage | undefined => {
  if (data.length < 3) return undefined
  const status = data[0] ?? 0
  const first = data[1] ?? -1
  const second = data[2] ?? -1
  if (first < 0 || first > MIDI_MAX || second < 0 || second > MIDI_MAX) return undefined
  const channel = (status & 0x0f) + 1
  switch (status & 0xf0) {
    case 0x90:
      return second === 0 ? { kind: 'noteOff', channel, note: first } : { kind: 'noteOn', channel, note: first, velocity: second / MIDI_MAX }
    case 0x80:
      return { kind: 'noteOff', channel, note: first }
    case 0xb0:
      return { kind: 'cc', channel, cc: first, value: second }
    default:
      return undefined
  }
}

/** How a message reads in the app's status line: "Note C4 on ch 1", "CC 21 = 64 on ch 2". */
export const describeMidiMessage = (message: MidiMessage, noteName: (note: number) => string): string => {
  switch (message.kind) {
    case 'noteOn':
      return `Note ${noteName(message.note)} on ch ${message.channel}`
    case 'noteOff':
      return `Note ${noteName(message.note)} off ch ${message.channel}`
    case 'cc':
      return `CC ${message.cc} = ${message.value} on ch ${message.channel}`
  }
}
