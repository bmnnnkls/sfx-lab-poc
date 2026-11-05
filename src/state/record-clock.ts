import { useRecordSettings } from './record-settings'

type BeatReader = (agoMs: number) => number | undefined
let beatAt: BeatReader | undefined
let latency: (() => number) | undefined

/**
 * Connects the recorder to the audio clock, as `setTouchClock` does for touch: `beat` is the transport beat `agoMs`
 * before now (`AudioHost.recordingBeat`), `outputLatency` the output latency the browser reports, in seconds.
 * Called without arguments to disconnect.
 */
export const setRecordClock = (beat?: BeatReader, outputLatency?: () => number): void => {
  beatAt = beat
  latency = outputLatency
}

/** The transport beat now, by the audio clock, with no latency taken off; undefined while stopped. */
export const transportBeat = (): number | undefined => beatAt?.(0)

/** What the recorder takes off each note: the reported output latency plus the manual offset, in ms. */
export const recordLatencyMs = (): number => (latency?.() ?? 0) * 1000 + useRecordSettings.getState().latencyOffsetMs

/**
 * The transport beat a MIDI event stamped `timestamp` (the `performance.now()` clock) was played on: moved earlier by
 * `recordLatencyMs`, because you play to what you hear, which lags the transport by that much. Undefined while the
 * transport is stopped or nothing is connected.
 */
export const recordBeat = (timestamp: number = performance.now()): number | undefined => {
  if (!beatAt) return undefined
  return beatAt(Math.max(0, performance.now() - timestamp) + recordLatencyMs())
}
