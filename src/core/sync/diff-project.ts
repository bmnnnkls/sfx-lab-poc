import type { EngineCommand } from '../engine'
import { type ModuleLibrary, type Patch, flattenPatch } from '../patch'
import type { AudioTrack, InstrumentTrack, Project, Track } from '../project'

/** Identity of a patch's wiring, ignoring params and canvas positions. */
const structureOf = (patch: Patch): string =>
  JSON.stringify([
    patch.nodes.map((node) => [node.id, node.type]),
    patch.connections.map(({ from, to }) => [from.node, from.port, to.node, to.port]),
  ])

/**
 * The engine only knows plain nodes, so module uses are expanded first. A knob on a module then reaches the
 * engine as an ordinary parameter change of an inner node, and editing a module's definition updates every
 * track that uses it.
 */
const diffPatch = (
  /** `patch` is the instrument's sound patch, `fx` the track's insert graph. */
  slot: 'patch' | 'fx',
  trackId: string,
  prevPatch: Patch,
  prevModules: ModuleLibrary,
  nextPatch: Patch,
  nextModules: ModuleLibrary,
): EngineCommand[] => {
  if (prevPatch === nextPatch && prevModules === nextModules) return []
  const prev = flattenPatch(prevPatch, prevModules)
  const next = flattenPatch(nextPatch, nextModules)
  if (prev === next) return []
  if (structureOf(prev) !== structureOf(next)) {
    return [slot === 'fx' ? { type: 'track/setFx', trackId, graph: next } : { type: 'track/setPatch', trackId, patch: next }]
  }

  // Same wiring: push only what changed so knobs and pickers work without rebuilding the voice.
  const commands: EngineCommand[] = []
  for (const node of next.nodes) {
    const before = prev.nodes.find((candidate) => candidate.id === node.id)
    for (const [paramId, value] of Object.entries(node.params)) {
      if (before?.params[paramId] !== value) {
        commands.push({ type: 'track/setParam', trackId, nodeId: node.id, paramId, value })
      }
    }
    if (before?.sampleId !== node.sampleId) {
      commands.push({
        type: 'track/setSample',
        trackId,
        nodeId: node.id,
        sampleId: node.sampleId ?? null,
      })
    }
  }
  return commands
}

const sameClips = (a: readonly unknown[], b: readonly unknown[]): boolean =>
  a === b || (a.length === b.length && a.every((clip, index) => clip === b[index]))

/** What the note graph does, ignoring where its nodes sit on the canvas. */
const behaviourOf = (graph: Patch): string =>
  JSON.stringify([
    graph.nodes.map((node) => [node.id, node.type, node.params, node.trackId ?? null, node.bypassed ?? false]),
    graph.connections.map(({ from, to }) => [from.node, from.port, to.node, to.port]),
  ])

const diffInstrumentTrack = (
  prev: InstrumentTrack,
  next: InstrumentTrack,
  before: ModuleLibrary,
  after: ModuleLibrary,
): EngineCommand[] => {
  const commands = diffPatch('patch', next.id, prev.patch, before, next.patch, after)
  if (!sameClips(prev.clips, next.clips)) {
    commands.push({ type: 'track/setClips', trackId: next.id, clips: next.clips })
  }
  if (prev.noteGraph !== next.noteGraph || before !== after) {
    // Module uses are expanded first; the ids of expanded nodes are stable, so running nodes keep their state.
    const graph = flattenPatch(next.noteGraph, after)
    if (behaviourOf(flattenPatch(prev.noteGraph, before)) !== behaviourOf(graph)) {
      commands.push({ type: 'track/setNoteGraph', trackId: next.id, graph })
    }
  }
  if (prev.voices !== next.voices) {
    commands.push({ type: 'track/setVoices', trackId: next.id, voices: next.voices })
  }
  return commands
}

const diffAudioTrack = (prev: AudioTrack, next: AudioTrack): EngineCommand[] =>
  sameClips(prev.clips, next.clips)
    ? []
    : [{ type: 'track/setAudioClips', trackId: next.id, clips: next.clips }]

const diffTrack = (prev: Track, next: Track, before: ModuleLibrary, after: ModuleLibrary): EngineCommand[] => {
  const commands =
    prev.kind === 'instrument' && next.kind === 'instrument'
      ? diffInstrumentTrack(prev, next, before, after)
      : prev.kind === 'audio' && next.kind === 'audio'
        ? diffAudioTrack(prev, next)
        : []
  commands.push(...diffPatch('fx', next.id, prev.fx, before, next.fx, after))
  if (prev.volume !== next.volume) {
    commands.push({ type: 'track/setVolume', trackId: next.id, volume: next.volume })
  }
  return commands
}

const addTrackCommand = (track: Track, modules: ModuleLibrary): EngineCommand =>
  track.kind === 'audio'
    ? {
        type: 'track/add',
        kind: 'audio',
        trackId: track.id,
        fx: flattenPatch(track.fx, modules),
        clips: track.clips,
        volume: track.volume,
      }
    : {
        type: 'track/add',
        kind: 'instrument',
        trackId: track.id,
        patch: flattenPatch(track.patch, modules),
        noteGraph: flattenPatch(track.noteGraph, modules),
        fx: flattenPatch(track.fx, modules),
        clips: track.clips,
        volume: track.volume,
        voices: track.voices,
      }

/** Commands that bring an engine holding `prev` (null = empty) in line with `next`. */
export const diffProject = (prev: Project | null, next: Project): EngineCommand[] => {
  const commands: EngineCommand[] = []
  if (prev?.tempo !== next.tempo) commands.push({ type: 'transport/setTempo', bpm: next.tempo })

  const before = prev?.modules ?? []
  const prevTracks = new Map((prev?.tracks ?? []).map((track) => [track.id, track]))
  const nextIds = new Set(next.tracks.map((track) => track.id))

  for (const id of prevTracks.keys()) {
    if (!nextIds.has(id)) commands.push({ type: 'track/remove', trackId: id })
  }
  for (const track of next.tracks) {
    const existing = prevTracks.get(track.id)
    if (!existing) {
      commands.push(addTrackCommand(track, next.modules))
    } else if (existing.kind !== track.kind) {
      commands.push({ type: 'track/remove', trackId: track.id }, addTrackCommand(track, next.modules))
    } else if (existing !== track || before !== next.modules) {
      commands.push(...diffTrack(existing, track, before, next.modules))
    }
  }
  return commands
}
