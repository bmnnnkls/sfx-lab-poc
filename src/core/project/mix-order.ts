import { audioSources, flattenPatch, sendTargets } from '../patch'
import type { Project, ReturnTrack, Track } from './types'

/** What the dependency rules below need to know about a project. */
export type MixGraph = Pick<Project, 'tracks' | 'modules'>

/** Ids of the tracks a track takes audio from with Track audio nodes (looking inside modules too). */
export const audioSourcesOf = (graph: Pick<Project, 'modules'>, track: Track): string[] => audioSources(flattenPatch(track.fx, graph.modules))

/** Ids of the return tracks a track's insert graph sends to (looking inside modules too). */
export const sendTargetsOf = (graph: Pick<Project, 'modules'>, track: Track): string[] => sendTargets(flattenPatch(track.fx, graph.modules))

/**
 * The tracks that must be mixed before `track`: the ones it takes audio from, and for a return track the ones that send to
 * it (with a Send node or a send knob). Notes taken from other tracks are not part of this: they are passed on before
 * any sound is mixed, so they have their own order.
 */
export const mixDependencies = (graph: MixGraph, trackId: string): string[] => {
  const track = graph.tracks.find((candidate) => candidate.id === trackId)
  if (!track) return []
  const deps = new Set(audioSourcesOf(graph, track))
  if (track.kind === 'return') {
    for (const sender of graph.tracks) {
      const knob = sender.kind !== 'return' && (sender.sends[trackId] ?? 0) > 0
      if (knob || sendTargetsOf(graph, sender).includes(trackId)) deps.add(sender.id)
    }
  }
  return [...deps]
}

/** True when `trackId` is mixed after `target`, directly or through other tracks. */
export const mixesAfter = (graph: MixGraph, trackId: string, target: string, seen = new Set<string>()): boolean => {
  if (seen.has(trackId)) return false
  seen.add(trackId)
  return mixDependencies(graph, trackId).some((dep) => dep === target || mixesAfter(graph, dep, target, seen))
}

/**
 * The return tracks `trackId` may send to: every other return track that is not (however indirectly) mixed before it,
 * which would make the two depend on each other. Any track may send to any return; a return may send to a later one.
 */
export const sendableReturns = (graph: MixGraph, trackId: string): ReturnTrack[] =>
  graph.tracks.flatMap((track) =>
    track.kind === 'return' && track.id !== trackId && !mixesAfter(graph, trackId, track.id) ? [track] : [],
  )

/**
 * The tracks `trackId` may take audio from: every other track that is not (however indirectly) mixed after it, which
 * would make the two depend on each other.
 */
export const audioSourceTracks = (graph: MixGraph, trackId: string): Track[] =>
  graph.tracks.filter((track) => track.id !== trackId && !mixesAfter(graph, track.id, trackId))
