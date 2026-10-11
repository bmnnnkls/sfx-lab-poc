import { noteTapSources } from '../notefx'
import { type ModuleLibrary, type Patch, clearTrackReferences, flattenPatch, sendTargets, setNodeTrack } from '../patch'
import type { Track } from '../project'
import type { Warn } from './raw'

/** One way a graph can point at another track, with what makes such a pointer valid. */
interface Reference {
  /** The graph of `track` that holds the pointers, if it has one. */
  graphOf(track: Track): Patch | undefined
  withGraph(track: Track, graph: Patch): Track
  /** Ids the track's graph points at (looking inside modules too). */
  pointsAt(track: Track, modules: ModuleLibrary): string[]
  /** Whether `owner` may point at `target` at all, before looking for loops. */
  accepts(owner: Track, target: Track | undefined): boolean
  missing: string
  loop: string
}

const noteTaps: Reference = {
  graphOf: (track) => (track.kind === 'instrument' ? track.noteGraph : undefined),
  withGraph: (track, noteGraph) => (track.kind === 'instrument' ? { ...track, noteGraph } : track),
  pointsAt: (track, modules) => (track.kind === 'instrument' ? noteTapSources(flattenPatch(track.noteGraph, modules)) : []),
  accepts: (owner, target) => target !== undefined && target.id !== owner.id,
  missing: 'dropped a "notes from track" input that points at a missing track or at itself',
  loop: 'dropped a "notes from track" input that would make two tracks feed each other',
}

const sends: Reference = {
  graphOf: (track) => track.fx,
  withGraph: (track, fx) => ({ ...track, fx }),
  pointsAt: (track, modules) => sendTargets(flattenPatch(track.fx, modules)),
  accepts: (owner, target) => target?.kind === 'return' && target.id !== owner.id,
  missing: 'dropped a Send that points at something that is not a return track (or at its own track)',
  loop: 'dropped a Send that would make two return tracks feed each other',
}

/** True when `from` points, directly or through other tracks, at `target`. */
const reaches = (
  kind: Reference,
  tracks: readonly Track[],
  modules: ModuleLibrary,
  from: string,
  target: string,
  seen = new Set<string>(),
): boolean => {
  if (seen.has(from)) return false
  seen.add(from)
  const track = tracks.find((candidate) => candidate.id === from)
  return track !== undefined && kind.pointsAt(track, modules).some((next) => next === target || reaches(kind, tracks, modules, next, target, seen))
}

const repair = (kind: Reference, tracks: Track[], modules: ModuleLibrary, warn: Warn): Track[] => {
  const byId = new Map(tracks.map((track) => [track.id, track]))
  // A pointer to a track that is not there, or that it may not point at: dropped.
  let repaired = tracks.map((track) => {
    const graph = kind.graphOf(track)
    if (!graph) return track
    let fixed = graph
    for (const node of graph.nodes) {
      if (node.trackId !== undefined && !kind.accepts(track, byId.get(node.trackId))) {
        warn(`Track "${track.name}": ${kind.missing}`)
        fixed = clearTrackReferences(fixed, node.trackId)
      }
    }
    return fixed === graph ? track : kind.withGraph(track, fixed)
  })

  // A pointer that closes a loop (even through other tracks): dropped.
  for (const original of tracks) {
    for (const node of kind.graphOf(original)?.nodes ?? []) {
      const current = repaired.find((candidate) => candidate.id === original.id)
      const graph = current && kind.graphOf(current)
      const target = graph?.nodes.find((candidate) => candidate.id === node.id)?.trackId
      if (!current || !graph || target === undefined || !reaches(kind, repaired, modules, target, original.id)) continue
      warn(`Track "${original.name}": ${kind.loop}`)
      repaired = repaired.map((candidate) => (candidate === current ? kind.withGraph(candidate, setNodeTrack(graph, node.id, null)) : candidate))
    }
  }
  return repaired
}

/**
 * Makes everything that points at another track valid: "notes from another track" inputs and Sends. A pointer to a
 * track that is not in the file, to the track itself, to the wrong kind of track (a Send must point at a return track),
 * or that would make two tracks feed each other (even through others) is dropped.
 */
export const repairTrackReferences = (tracks: Track[], modules: ModuleLibrary, warn: Warn): Track[] =>
  repair(sends, repair(noteTaps, tracks, modules, warn), modules, warn)
