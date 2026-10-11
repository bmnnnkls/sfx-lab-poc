import { noteTapSources } from '../notefx'
import { type ModuleLibrary, type Patch, clearTrackReferences, flattenPatch, setNodeTrack } from '../patch'
import { type Track, mixesAfter } from '../project'
import type { Warn } from './raw'

/** One way a graph can point at another track, with what makes such a pointer valid. */
interface Reference {
  /** The graph of `track` that holds the pointers, if it has one. */
  graphOf(track: Track): Patch | undefined
  withGraph(track: Track, graph: Patch): Track
  /** Whether `owner` may point at `target` at all, before looking for loops. */
  accepts(owner: Track, target: Track | undefined): boolean
  /** The node type that holds the pointer. */
  readonly nodeType: string
  readonly missing: string
  readonly loop: string
}

const noteTaps: Reference = {
  graphOf: (track) => (track.kind === 'instrument' ? track.noteGraph : undefined),
  withGraph: (track, noteGraph) => (track.kind === 'instrument' ? { ...track, noteGraph } : track),
  accepts: (owner, target) => target !== undefined && target.id !== owner.id,
  nodeType: 'trackNotes',
  missing: 'dropped a "notes from track" input that points at a missing track or at itself',
  loop: 'dropped a "notes from track" input that would make two tracks feed each other',
}

const sends: Reference = {
  graphOf: (track) => track.fx,
  withGraph: (track, fx) => ({ ...track, fx }),
  accepts: (owner, target) => target?.kind === 'return' && target.id !== owner.id,
  nodeType: 'send',
  missing: 'dropped a Send that points at something that is not a return track (or at its own track)',
  loop: 'dropped a Send that would make two tracks depend on each other',
}

const audio: Reference = {
  graphOf: (track) => track.fx,
  withGraph: (track, fx) => ({ ...track, fx }),
  accepts: (owner, target) => target !== undefined && target.id !== owner.id,
  nodeType: 'trackAudio',
  missing: 'dropped a "audio from track" input that points at a missing track or at itself',
  loop: 'dropped an "audio from track" input that would make two tracks depend on each other',
}

/** The pointers of a kind in a graph: its nodes that hold one. */
const pointers = (kind: Reference, track: Track) => kind.graphOf(track)?.nodes.filter((node) => node.type === kind.nodeType) ?? []

/** A pointer to a track that is not there, or that its owner may not point at: dropped. */
const repairInvalid = (kind: Reference, tracks: Track[], warn: Warn): Track[] => {
  const byId = new Map(tracks.map((track) => [track.id, track]))
  return tracks.map((track) => {
    const graph = kind.graphOf(track)
    if (!graph) return track
    let fixed = graph
    for (const node of pointers(kind, track)) {
      if (node.trackId !== undefined && !kind.accepts(track, byId.get(node.trackId))) {
        warn(`Track "${track.name}": ${kind.missing}`)
        fixed = clearTrackReferences(fixed, node.trackId)
      }
    }
    return fixed === graph ? track : kind.withGraph(track, fixed)
  })
}

/**
 * Drops, one at a time, every pointer of the given kinds that closes a loop, judged on the tracks as repaired so far.
 * `closesLoop(tracks, owner, target)` says whether `owner` pointing at `target` does.
 */
const repairLoops = (
  kind: Reference,
  tracks: Track[],
  warn: Warn,
  closesLoop: (current: Track[], owner: Track, target: string) => boolean,
): Track[] => {
  let repaired = tracks
  for (const original of tracks) {
    for (const node of pointers(kind, original)) {
      const current = repaired.find((candidate) => candidate.id === original.id)
      const graph = current && kind.graphOf(current)
      const target = graph?.nodes.find((candidate) => candidate.id === node.id)?.trackId
      if (!current || !graph || target === undefined || !closesLoop(repaired, current, target)) continue
      warn(`Track "${original.name}": ${kind.loop}`)
      repaired = repaired.map((candidate) => (candidate === current ? kind.withGraph(candidate, setNodeTrack(graph, node.id, null)) : candidate))
    }
  }
  return repaired
}

/**
 * Makes everything that points at another track valid: "notes from another track" inputs, Sends and "audio from another
 * track" inputs. A pointer to a track that is not in the file, to the track itself, to the wrong kind of track (a Send
 * must point at a return track), or that would make tracks depend on each other in a loop (even through others, and for
 * sound counting the Sends and the send knobs of the file too) is dropped, with a warning.
 */
export const repairTrackReferences = (tracks: Track[], modules: ModuleLibrary, warn: Warn): Track[] => {
  // Notes are passed on before sound is mixed, so they are ordered apart from Sends and Track audio.
  let repaired = repairInvalid(noteTaps, tracks, warn)
  repaired = repairLoops(noteTaps, repaired, warn, (current, owner, target) => noteReaches(current, modules, target, owner.id))

  repaired = repairInvalid(audio, repairInvalid(sends, repaired, warn), warn)
  // A Send makes its return depend on the sender; Track audio makes the reader depend on the source.
  repaired = repairLoops(sends, repaired, warn, (current, owner, target) => mixesAfter({ tracks: current, modules }, owner.id, target))
  return repairLoops(audio, repaired, warn, (current, owner, target) => mixesAfter({ tracks: current, modules }, target, owner.id))
}

/** True when `from` takes notes, directly or through other tracks, from `target`. */
const noteReaches = (tracks: readonly Track[], modules: ModuleLibrary, from: string, target: string, seen = new Set<string>()): boolean => {
  if (seen.has(from)) return false
  seen.add(from)
  const track = tracks.find((candidate) => candidate.id === from)
  const sources = track?.kind === 'instrument' ? noteTapSources(flattenPatch(track.noteGraph, modules)) : []
  return sources.some((source) => source === target || noteReaches(tracks, modules, source, target, seen))
}
