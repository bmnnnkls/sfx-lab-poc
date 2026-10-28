import { useStatusStore } from '@state'

/** -60 dB: a track whose peak is above this is sounding. */
export const SOUNDING_PEAK = 0.001

/**
 * Whether any of these tracks is sounding now: its peak in the status, after its fader, mute and solo, is above
 * -60 dB. A boolean selector, so the 30 status updates a second render only when it changes.
 */
export const useSounding = (trackIds: readonly string[]): boolean =>
  useStatusStore((state) => trackIds.some((id) => (state.status?.peaks[id] ?? 0) > SOUNDING_PEAK))
