import type { MidiTrackInput } from '@core'

/** A track input in words: "Pads, channel 10", "Any input, any channel". */
export const describeTrackInput = (input: MidiTrackInput, inputName?: string): string =>
  `${input.deviceId === undefined ? 'Any input' : inputName ?? input.deviceName ?? input.deviceId}, ${input.channel === undefined ? 'any channel' : `channel ${input.channel + 1}`}`

/** The short tag on a track's header: "midi", or "midi 10" for one channel. */
export const trackInputTag = (input: MidiTrackInput): string => (input.channel === undefined ? 'midi' : `midi ${input.channel + 1}`)
