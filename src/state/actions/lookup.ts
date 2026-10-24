import type { AudioClip, Clip, Project, Track } from '@core'
import { useProjectStore } from '../project-store'

/** The current project, read when an action runs or the menu draws. */
export const project = (): Project => useProjectStore.getState().project

export const trackOf = (trackId: string): Track | undefined => project().tracks.find((track) => track.id === trackId)

/** A session clip and its scene, or undefined when it is gone. */
export const sessionClipOf = (trackId: string, clipId: string): { clip: Clip | AudioClip; scene: number } | undefined => {
  const track = trackOf(trackId)
  if (!track || track.kind === 'return') return undefined
  const scene = track.clips.findIndex((clip) => clip?.id === clipId)
  const clip = track.clips[scene]
  return clip ? { clip, scene } : undefined
}
