import { flattenPatch } from '../patch'
import { noteTapSources } from '../notefx'
import type { InstrumentTrack, Project } from './types'

/** Ids of the tracks a track's note graph reads notes from (looking inside modules too). */
export const tapSourcesOf = (project: Project, track: InstrumentTrack): string[] =>
  noteTapSources(flattenPatch(track.noteGraph, project.modules))

/** True when `track` reads notes, directly or through other tracks, from `target`. */
export const readsNotesFrom = (project: Project, trackId: string, target: string, seen = new Set<string>()): boolean => {
  if (seen.has(trackId)) return false
  seen.add(trackId)
  const track = project.tracks.find((candidate) => candidate.id === trackId)
  if (track?.kind !== 'instrument') return false
  return tapSourcesOf(project, track).some((source) => source === target || readsNotesFrom(project, source, target, seen))
}

/**
 * The tracks `trackId` may take notes from: every other instrument track that does not itself (however indirectly)
 * take notes from `trackId`, which would make the two feed each other.
 */
export const tappableTracks = (project: Project, trackId: string): InstrumentTrack[] =>
  project.tracks.flatMap((track) =>
    track.kind === 'instrument' && track.id !== trackId && !readsNotesFrom(project, track.id, trackId) ? [track] : [],
  )
