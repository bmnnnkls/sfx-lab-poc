import { sanitizeLibraryOrigins } from './sanitize-library-origins'
import { sanitizePresetFields } from './sanitize-presets'
import { sanitizeAutomationSlots } from './sanitize-automation-slots'
import { sanitizeMidiMappings } from './sanitize-midi-mappings'
import { sanitizeControlValues } from './sanitize-control-values'
import {
  DEFAULT_SCENE_COUNT,
  DEFAULT_VOICES,
  MAX_NAME_LENGTH,
  NAME_LIMITS,
  MAX_TEMPO,
  MAX_VOICES,
  MIN_TEMPO,
  MIN_VOICES,
  type Project,
  type Track,
} from '../project'
import { sanitizeMidiTrackInput } from '../midi'
import { type ModuleDefinition, createDefaultFxGraph, createDefaultMasterGraph, createDefaultNoteGraph, createDefaultReturnGraph } from '../patch'
import { clamp, createId } from '../shared'
import { LIMITS } from './format'
import { type Warn, asList, finiteNumber, isRecord, nonEmptyText } from './raw'
import { sanitizeArrangement, sanitizeArrangementMarks } from './sanitize-arrangement'
import { sanitizeAudioClip } from './sanitize-audio-clip'
import { sanitizeClip } from './sanitize-clip'
import { repairGroupOrder, sanitizeGroups } from './sanitize-groups'
import { repairTrackReferences } from './sanitize-track-references'
import { sanitizeModules } from './sanitize-modules'
import { sanitizePins } from './sanitize-pins'
import { sanitizePatch } from './sanitize-patch'
import { sanitizeSamples } from './sanitize-samples'
import { readSends, repairSendLevels } from './sanitize-sends'

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
  const name = nonEmptyText(raw.name, `Track ${index + 1}`, NAME_LIMITS.track)
  const where = `Track "${name}"`

  const id = typeof raw.id === 'string' && !usedTrackIds.has(raw.id) ? raw.id : createId('track')
  if (typeof raw.id === 'string' && usedTrackIds.has(raw.id)) warn(`${where}: duplicate owner ID "${raw.id}" repaired; references to that ID are ambiguous and were not rebound. Recover intent from the original file or backup.`)
  usedTrackIds.add(id)

  const rawClips = asList(raw.clips)
  const usedClipIds = new Set<string>()
  const volume = clamp(finiteNumber(raw.volume, 0.8), 0, 1)
  // Mix settings are saved only when they differ from the default, so files that never used them are unchanged.
  const pan = clamp(finiteNumber(raw.pan, 0), -1, 1)
  const mix = {
    ...(pan !== 0 && { pan }),
    ...(raw.muted === true && { muted: true }),
    ...(raw.soloed === true && { soloed: true }),
    // Checked against the groups by `sanitizeGroups`.
    ...(typeof raw.groupId === 'string' && { groupId: raw.groupId }),
    ...(raw.hidden === true && { hidden: true }),
  }
  // Files from before insert graphs existed have none: the sound passes through untouched.
  const isReturn = raw.kind === 'return'
  const fx = isRecord(raw.fx)
    ? sanitizePatch(raw.fx, `${where} effects`, sampleIds, modules, warn)
    : isReturn
      ? createDefaultReturnGraph()
      : createDefaultFxGraph()

  if (isReturn) {
    const automationSlots = sanitizeAutomationSlots(raw.automationSlots, sceneCount, { kind: 'track', trackId: id }, warn)
    return { kind: 'return', id, name, volume, ...mix, fx, ...(automationSlots && { automationSlots }) }
  }

  // Files from before audio tracks existed have no `kind`: they are instrument tracks.
  if (raw.kind === 'audio') {
    return {
      kind: 'audio',
      id,
      name,
      volume,
      ...mix,
      fx,
      sends: readSends(raw.sends),
      clips: Array.from({ length: sceneCount }, (_, scene) =>
        sanitizeAudioClip(rawClips[scene], where, sampleIds, usedClipIds, warn, { kind: 'track', trackId: id }),
      ),
    }
  }

  const clips = Array.from({ length: sceneCount }, (_, scene) =>
    sanitizeClip(rawClips[scene], where, usedClipIds, warn, { kind: 'track', trackId: id }),
  )
  const midiInput = raw.midiInput === undefined ? undefined : sanitizeMidiTrackInput(raw.midiInput)
  if (raw.midiInput !== undefined && midiInput === undefined) warn(`${where}: invalid MIDI input dropped; the track follows the selection`)

  return {
    kind: 'instrument',
    id,
    name,
    volume,
    ...mix,
    fx,
    sends: readSends(raw.sends),
    voices: Math.round(clamp(finiteNumber(raw.voices, DEFAULT_VOICES), MIN_VOICES, MAX_VOICES)),
    patch: sanitizePatch(raw.patch, where, sampleIds, modules, warn),
    noteGraph: isRecord(raw.noteGraph)
      ? sanitizePatch(raw.noteGraph, where, sampleIds, modules, warn, 'notes')
      : createDefaultNoteGraph(),
    clips,
    // Absent: the track follows the selection, as in files from before track inputs.
    ...(midiInput && { midiInput }),
  }
}

const masterVolume = (raw: unknown): number => clamp(finiteNumber(raw, 1), 0, 1)

/** A scene's name is a short label for a narrow button. */
export const MAX_SCENE_NAME = NAME_LIMITS.scene

/** One text per scene (extra entries and anything that is not text are dropped, long names cut); nothing at all when no scene has a name. */
const sceneNamesOf = (raw: unknown, sceneCount: number): string[] | undefined => {
  const names = asList(raw)
    .slice(0, sceneCount)
    .map((name) => (typeof name === 'string' ? name.trim().slice(0, MAX_SCENE_NAME) : ''))
  return names.some((name) => name !== '') ? names : undefined
}

/** Turns arbitrary parsed JSON into a valid `Project`, or null when it isn't an object at all. */
export const sanitizeProject = (raw: unknown, warn: Warn): Project | null => {
  if (!isRecord(raw)) return null

  const sceneCount = Math.round(
    clamp(finiteNumber(raw.sceneCount, DEFAULT_SCENE_COUNT), 1, LIMITS.scenes),
  )

  const sceneNames = sceneNamesOf(raw.sceneNames, sceneCount)

  const rawTracks = asList(raw.tracks)
  if (rawTracks.length > LIMITS.tracks) warn(`Only the first ${LIMITS.tracks} tracks were kept`)

  const samples = sanitizeSamples(raw.samples, warn)
  const sampleIds = new Set(samples.map((sample) => sample.id))
  const modules = sanitizeModules(raw.modules, sampleIds, warn)

  const usedTrackIds = new Set<string>()
  const read = rawTracks
    .slice(0, LIMITS.tracks)
    .map((track, index) => sanitizeTrack(track, index, sceneCount, usedTrackIds, sampleIds, modules, warn))
    .filter((track): track is Track => track !== null)
  const grouped = sanitizeGroups(raw.groups, read, sampleIds, modules, warn)
  const references = repairTrackReferences(grouped.tracks, grouped.groups, modules, warn)
  const { tracks, groups } = repairSendLevels(references.tracks, references.groups, modules, warn)

  const libraryOrigins = sanitizeLibraryOrigins(raw.libraryOrigins, warn)
  const controlValues = sanitizeControlValues(raw.controlValues, warn)
  const midiMappings = sanitizeMidiMappings(raw.midiMappings, warn)
  const arrangement = sanitizeArrangement(raw.arrangement, new Set(tracks.map((track) => track.id)), sampleIds, warn)
  const marks = sanitizeArrangementMarks(raw.arrangementMarkers, raw.arrangementLoop, warn)
  const project = repairGroupOrder({
    ...sanitizePresetFields(raw, sampleIds, warn),
    ...(libraryOrigins && { libraryOrigins }),
    ...(controlValues && { controlValues }),
    ...(midiMappings && { midiMappings }),
    name: nonEmptyText(raw.name, 'Untitled', MAX_NAME_LENGTH),
    tempo: clamp(finiteNumber(raw.tempo, 120), MIN_TEMPO, MAX_TEMPO),
    sceneCount,
    ...(sceneNames && { sceneNames }),
    samples,
    modules,
    ...(arrangement && { arrangement }),
    ...(marks.markers && { arrangementMarkers: marks.markers }),
    ...(marks.loop && { arrangementLoop: marks.loop }),
    // Files from before the master bus existed have none: the mix passes through untouched.
    master: {
      ...(isRecord(raw.master) && raw.master.automationSlots !== undefined && { automationSlots: sanitizeAutomationSlots(raw.master.automationSlots, sceneCount, { kind: 'master' }, warn) }),
      fx:
        isRecord(raw.master) && isRecord(raw.master.fx)
          ? sanitizePatch(raw.master.fx, 'Master effects', sampleIds, modules, warn)
          : createDefaultMasterGraph(),
      ...(isRecord(raw.master) && masterVolume(raw.master.volume) !== 1 && { volume: masterVolume(raw.master.volume) }),
    },
    tracks,
    ...(groups && { groups }),
  }, warn)
  // Read last: a pin is kept only when its graph is in what was read.
  const pins = sanitizePins(raw.pins, project, warn)
  return pins ? { ...project, pins } : project
}
