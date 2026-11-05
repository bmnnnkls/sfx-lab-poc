import type { AudioClip, Clip, ControlOwner, Project, Track } from '@core'
import { useProjectStore } from '../project-store'

/** The current project, read when an action runs or the menu draws. */
export const project = (): Project => useProjectStore.getState().project

export const trackOf = (trackId: string): Track | undefined => project().tracks.find((track) => track.id === trackId)

/** An owner's name: a track's or a group's own, or *Master*. */
export const ownerName = (owner: ControlOwner): string =>
  owner.kind === 'master' ? 'Master' : owner.kind === 'group' ? (project().groups?.find((group) => group.id === owner.groupId)?.name ?? 'Group') : (trackOf(owner.trackId)?.name ?? 'Track')

/** A session clip and its scene, or undefined when it is gone. */
export const sessionClipOf = (trackId: string, clipId: string): { clip: Clip | AudioClip; scene: number } | undefined => {
  const track = trackOf(trackId)
  if (!track || track.kind === 'return') return undefined
  const scene = track.clips.findIndex((clip) => clip?.id === clipId)
  const clip = track.clips[scene]
  return clip ? { clip, scene } : undefined
}
