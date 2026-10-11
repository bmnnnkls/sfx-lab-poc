import type { Track } from '@core'

/** The order tracks are shown in the session grid: the clip tracks first, the return tracks (no clips) apart at the end. */
export const sessionOrder = (tracks: readonly Track[]): Track[] => [
  ...tracks.filter((track) => track.kind !== 'return'),
  ...tracks.filter((track) => track.kind === 'return'),
]
