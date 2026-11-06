/**
 * Where an instrument track takes live MIDI notes from, when it doesn't follow the selection: one input device (or any)
 * and one channel (or any). Saved with the project; the device is matched by its id only, never guessed from its name
 * (`deviceName` is for showing an input that isn't connected).
 */
export interface MidiTrackInput {
  /** Absent: any input. */
  readonly deviceId?: string
  readonly deviceName?: string
  /** Zero-based, like engine commands. Absent: any channel. */
  readonly channel?: number
}

/** Whether a note from this input and channel (zero-based) is for a track listening on `input`. */
export const midiInputMatches = (input: MidiTrackInput, deviceId: string, channel: number): boolean =>
  (input.deviceId === undefined || input.deviceId === deviceId) && (input.channel === undefined || input.channel === channel)

/**
 * A well-formed track input, or undefined (the track then follows the selection) when it isn't an object or its device
 * or channel is malformed: dropping just that part would widen the input to any device or any channel. A malformed name
 * is left out.
 */
export const sanitizeMidiTrackInput = (raw: unknown): MidiTrackInput | undefined => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const entry = raw as Record<string, unknown>
  const deviceId = typeof entry.deviceId === 'string' && entry.deviceId.length > 0 && entry.deviceId.length <= 256 ? entry.deviceId : undefined
  const deviceName = deviceId && typeof entry.deviceName === 'string' && entry.deviceName.length <= 256 ? entry.deviceName : undefined
  const channel = Number.isInteger(entry.channel) && (entry.channel as number) >= 0 && (entry.channel as number) <= 15 ? (entry.channel as number) : undefined
  if ((entry.deviceId !== undefined && deviceId === undefined) || (entry.channel !== undefined && channel === undefined)) return undefined
  return { ...(deviceId !== undefined && { deviceId }), ...(deviceName !== undefined && { deviceName }), ...(channel !== undefined && { channel }) }
}
