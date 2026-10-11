import { flattenPatch, sendTargets } from '../patch'
import type { Project, ReturnTrack, Track } from './types'

/** Ids of the return tracks a track's insert graph sends to (looking inside modules too). */
export const sendTargetsOf = (project: Project, track: Track): string[] =>
  sendTargets(flattenPatch(track.fx, project.modules))

/** True when `trackId` sends, directly or through other return tracks, to `target`. */
export const sendsReach = (project: Project, trackId: string, target: string, seen = new Set<string>()): boolean => {
  if (seen.has(trackId)) return false
  seen.add(trackId)
  const track = project.tracks.find((candidate) => candidate.id === trackId)
  return track !== undefined && sendTargetsOf(project, track).some((next) => next === target || sendsReach(project, next, target, seen))
}

/**
 * The return tracks `trackId` may send to: every other return track that does not itself (however indirectly) send to
 * `trackId`, which would make the two feed each other. Any track may send to any return; a return may send to a later one.
 */
export const sendableReturns = (project: Project, trackId: string): ReturnTrack[] =>
  project.tracks.flatMap((track) =>
    track.kind === 'return' && track.id !== trackId && !sendsReach(project, track.id, trackId) ? [track] : [],
  )
