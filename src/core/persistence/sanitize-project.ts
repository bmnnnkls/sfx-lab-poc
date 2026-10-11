import {
  DEFAULT_SCENE_COUNT,
  MAX_NAME_LENGTH,
  MAX_TEMPO,
  MIN_TEMPO,
  type Project,
  type Track,
} from '../project'
import { clamp, createId } from '../shared'
import { LIMITS } from './format'
import { type Warn, asList, finiteNumber, isRecord, nonEmptyText } from './raw'
import { sanitizeClip } from './sanitize-clip'
import { sanitizePatch } from './sanitize-patch'

const sanitizeTrack = (
  raw: unknown,
  index: number,
  sceneCount: number,
  usedTrackIds: Set<string>,
  warn: Warn,
): Track | null => {
  if (!isRecord(raw)) {
    warn(`Track ${index + 1}: skipped a malformed track`)
    return null
  }
  const name = nonEmptyText(raw.name, `Track ${index + 1}`, 40)
  const where = `Track "${name}"`

  const id = typeof raw.id === 'string' && !usedTrackIds.has(raw.id) ? raw.id : createId('track')
  usedTrackIds.add(id)

  const rawClips = asList(raw.clips)
  const usedClipIds = new Set<string>()
  const clips = Array.from({ length: sceneCount }, (_, scene) =>
    sanitizeClip(rawClips[scene], where, usedClipIds, warn),
  )

  return {
    id,
    name,
    volume: clamp(finiteNumber(raw.volume, 0.8), 0, 1),
    patch: sanitizePatch(raw.patch, where, warn),
    clips,
  }
}

/** Turns arbitrary parsed JSON into a valid `Project`, or null when it isn't an object at all. */
export const sanitizeProject = (raw: unknown, warn: Warn): Project | null => {
  if (!isRecord(raw)) return null

  const sceneCount = Math.round(
    clamp(finiteNumber(raw.sceneCount, DEFAULT_SCENE_COUNT), 1, LIMITS.scenes),
  )

  const rawTracks = asList(raw.tracks)
  if (rawTracks.length > LIMITS.tracks) warn(`Only the first ${LIMITS.tracks} tracks were kept`)

  const usedTrackIds = new Set<string>()
  const tracks = rawTracks
    .slice(0, LIMITS.tracks)
    .map((track, index) => sanitizeTrack(track, index, sceneCount, usedTrackIds, warn))
    .filter((track): track is Track => track !== null)

  return {
    name: nonEmptyText(raw.name, 'Untitled', MAX_NAME_LENGTH),
    tempo: clamp(finiteNumber(raw.tempo, 120), MIN_TEMPO, MAX_TEMPO),
    sceneCount,
    tracks,
  }
}
