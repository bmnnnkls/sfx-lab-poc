import type { SendLevels, Track } from '../project'
import { clamp } from '../shared'
import { LIMITS } from './format'
import { type Warn, finiteNumber, isRecord } from './raw'

/** Reads a track's send levels from untrusted data: numbers kept in 0..1, zeros and anything else left out. */
export const readSends = (raw: unknown): SendLevels =>
  isRecord(raw)
    ? Object.fromEntries(
        Object.entries(raw)
          .slice(0, LIMITS.tracks)
          .map(([id, level]) => [id, clamp(finiteNumber(level, 0), 0, 1)] as const)
          .filter(([, level]) => level > 0),
      )
    : {}

/** Drops send levels that point at something that is not a return track of the file (the track is gone, or never was one). */
export const repairSendLevels = (tracks: Track[], warn: Warn): Track[] => {
  const returns = new Set(tracks.filter((track) => track.kind === 'return').map((track) => track.id))
  return tracks.map((track) => {
    if (track.kind === 'return') return track
    const entries = Object.entries(track.sends)
    const kept = entries.filter(([id]) => returns.has(id))
    if (kept.length === entries.length) return track
    warn(`Track "${track.name}": dropped a send level for a track that is not a return track`)
    return { ...track, sends: Object.fromEntries(kept) }
  })
}
