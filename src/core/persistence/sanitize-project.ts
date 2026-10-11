import {
  DEFAULT_SCENE_COUNT,
  DEFAULT_VOICES,
  MAX_NAME_LENGTH,
  MAX_TEMPO,
  MAX_VOICES,
  MIN_TEMPO,
  MIN_VOICES,
  type Project,
  type Track,
} from '../project'
import { type ModuleDefinition, createDefaultFxGraph, createDefaultNoteGraph, createDefaultReturnGraph } from '../patch'
import { clamp, createId } from '../shared'
import { LIMITS } from './format'
import { type Warn, asList, finiteNumber, isRecord, nonEmptyText } from './raw'
import { sanitizeAudioClip } from './sanitize-audio-clip'
import { sanitizeClip } from './sanitize-clip'
import { repairTrackReferences } from './sanitize-track-references'
import { sanitizeModules } from './sanitize-modules'
import { sanitizePatch } from './sanitize-patch'
import { sanitizeSamples } from './sanitize-samples'

const sanitizeTrack = (
  raw: unknown,
  index: number,
  sceneCount: number,
  usedTrackIds: Set<string>,
  sampleIds: ReadonlySet<string>,
  modules: readonly ModuleDefinition[],
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
  const volume = clamp(finiteNumber(raw.volume, 0.8), 0, 1)
  // Files from before insert graphs existed have none: the sound passes through untouched.
  const isReturn = raw.kind === 'return'
  const fx = isRecord(raw.fx)
    ? sanitizePatch(raw.fx, `${where} effects`, sampleIds, modules, warn)
    : isReturn
      ? createDefaultReturnGraph()
      : createDefaultFxGraph()

  if (isReturn) return { kind: 'return', id, name, volume, fx }

  // Files from before audio tracks existed have no `kind`: they are instrument tracks.
  if (raw.kind === 'audio') {
    return {
      kind: 'audio',
      id,
      name,
      volume,
      fx,
      clips: Array.from({ length: sceneCount }, (_, scene) =>
        sanitizeAudioClip(rawClips[scene], where, sampleIds, usedClipIds, warn),
      ),
    }
  }

  const clips = Array.from({ length: sceneCount }, (_, scene) =>
    sanitizeClip(rawClips[scene], where, usedClipIds, warn),
  )

  return {
    kind: 'instrument',
    id,
    name,
    volume,
    fx,
    voices: Math.round(clamp(finiteNumber(raw.voices, DEFAULT_VOICES), MIN_VOICES, MAX_VOICES)),
    patch: sanitizePatch(raw.patch, where, sampleIds, modules, warn),
    noteGraph: isRecord(raw.noteGraph)
      ? sanitizePatch(raw.noteGraph, where, sampleIds, modules, warn, 'notes')
      : createDefaultNoteGraph(),
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

  const samples = sanitizeSamples(raw.samples, warn)
  const sampleIds = new Set(samples.map((sample) => sample.id))
  const modules = sanitizeModules(raw.modules, sampleIds, warn)

  const usedTrackIds = new Set<string>()
  const tracks = rawTracks
    .slice(0, LIMITS.tracks)
    .map((track, index) => sanitizeTrack(track, index, sceneCount, usedTrackIds, sampleIds, modules, warn))
    .filter((track): track is Track => track !== null)

  return {
    name: nonEmptyText(raw.name, 'Untitled', MAX_NAME_LENGTH),
    tempo: clamp(finiteNumber(raw.tempo, 120), MIN_TEMPO, MAX_TEMPO),
    sceneCount,
    samples,
    modules,
    tracks: repairTrackReferences(tracks, modules, warn),
  }
}
