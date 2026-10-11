import { type ModuleLibrary, clearTrackReferences, flattenPatch, setNodeTrack } from '../patch'
import { noteTapSources } from '../notefx'
import type { Track } from '../project'
import type { Warn } from './raw'

const sourcesOf = (track: Track, modules: ModuleLibrary): string[] =>
  track.kind === 'instrument' ? noteTapSources(flattenPatch(track.noteGraph, modules)) : []

/** True when `from` takes notes, directly or through other tracks, from `target`. */
const reaches = (tracks: readonly Track[], modules: ModuleLibrary, from: string, target: string, seen = new Set<string>()): boolean => {
  if (seen.has(from)) return false
  seen.add(from)
  const track = tracks.find((candidate) => candidate.id === from)
  return Boolean(track) && sourcesOf(track as Track, modules).some((source) => source === target || reaches(tracks, modules, source, target, seen))
}

/**
 * Makes "notes from another track" inputs valid: a reference to a track that is not in the file, or to the track
 * itself, is dropped, and so is one that would make two tracks take notes from each other (even through others).
 */
export const repairNoteTaps = (tracks: Track[], modules: ModuleLibrary, warn: Warn): Track[] => {
  const ids = new Set(tracks.map((track) => track.id))
  let repaired = tracks.map((track) => {
    if (track.kind !== 'instrument') return track
    let graph = track.noteGraph
    for (const node of track.noteGraph.nodes) {
      if (node.trackId !== undefined && (!ids.has(node.trackId) || node.trackId === track.id)) {
        warn(`Track "${track.name}": dropped a "notes from track" input that points at a missing track or at itself`)
        graph = clearTrackReferences(graph, node.trackId)
      }
    }
    return graph === track.noteGraph ? track : { ...track, noteGraph: graph }
  })

  for (const original of tracks) {
    if (original.kind !== 'instrument') continue
    for (const node of original.noteGraph.nodes) {
      const current = repaired.find((candidate) => candidate.id === original.id)
      const source = current?.kind === 'instrument' ? current.noteGraph.nodes.find((n) => n.id === node.id)?.trackId : undefined
      if (source === undefined || !reaches(repaired, modules, source, original.id)) continue
      warn(`Track "${original.name}": dropped a "notes from track" input that would make two tracks feed each other`)
      repaired = repaired.map((candidate) =>
        candidate.id === original.id && candidate.kind === 'instrument'
          ? { ...candidate, noteGraph: setNodeTrack(candidate.noteGraph, node.id, null) }
          : candidate,
      )
    }
  }
  return repaired
}
