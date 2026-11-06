import type { ClockPosition } from '@core'
import { useRecordSettings } from './record-settings'
import { useStatusStore } from './status-store'

/** The transport `agoMs` before now: a position (beat, run and loop pass), or just a beat (as tests give it). */
type PositionReader = (agoMs: number) => ClockPosition | number | undefined
let readAt: PositionReader | undefined
let latency: (() => number) | undefined

const asPosition = (read: ClockPosition | number | undefined): ClockPosition | undefined =>
  read === undefined ? undefined : typeof read === 'number' ? { beat: read, lap: 0, run: 0 } : read

/**
 * Connects the recorder to the audio clock, as `setTouchClock` does for touch: `position` is the transport `agoMs`
 * before now (`AudioHost.recordingPosition`), `outputLatency` the output latency the browser reports, in seconds.
 * Called without arguments to disconnect.
 */
export const setRecordClock = (position?: PositionReader, outputLatency?: () => number): void => {
  readAt = position
  latency = outputLatency
}

/** The transport now, by the audio clock, with no latency taken off; undefined while stopped. */
export const transportPosition = (): ClockPosition | undefined => asPosition(readAt?.(0))

/** The transport beat now, by the audio clock, with no latency taken off; undefined while stopped. */
export const transportBeat = (): number | undefined => transportPosition()?.beat

/** What the recorder takes off each note: the reported output latency plus the manual offset, in ms. */
export const recordLatencyMs = (): number => (latency?.() ?? 0) * 1000 + useRecordSettings.getState().latencyOffsetMs

/**
 * Where the transport was when a MIDI event stamped `timestamp` (the `performance.now()` clock) was played: moved
 * earlier by `recordLatencyMs`, because you play to what you hear, which lags the transport by that much. Undefined
 * while the transport is stopped or nothing is connected.
 */
export const recordPosition = (timestamp: number = performance.now()): ClockPosition | undefined => {
  if (!readAt) return undefined
  const ago = Math.max(0, performance.now() - timestamp), latency = recordLatencyMs()
  const position = asPosition(readAt(ago + latency))
  if (position !== undefined || latency <= 0) return position
  // Played just after the transport started, heard as before it: counted back from the event's own beat, at the
  // tempo, so it lands just before the start (where a take counts it as on its first beat).
  const played = asPosition(readAt(ago))
  return played === undefined ? undefined : { ...played, beat: played.beat - (latency / 60_000) * (useStatusStore.getState().status?.tempo ?? 120) }
}

/** The transport beat a MIDI event stamped `timestamp` was played on (`recordPosition`'s beat). */
export const recordBeat = (timestamp?: number): number | undefined => recordPosition(timestamp)?.beat
