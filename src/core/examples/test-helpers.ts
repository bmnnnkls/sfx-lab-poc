import { renderProject } from '../engine'
import type { Patch } from '../patch'
import type { InstrumentTrack, Project, Track } from '../project'

/** Rendering is the slow part of these tests: the same engine as the app, a few seconds each. */
export const SLOW = 120_000

export const renderScene = (project: Project, scene: number, bars: number, maxTail = 0) =>
  renderProject(project, [], { scope: { kind: 'scene', scene }, bars, maxTail })

export const peak = (left: Float32Array, right: Float32Array): number => {
  let value = 0
  for (let i = 0; i < left.length; i++) value = Math.max(value, Math.abs(left[i] as number), Math.abs(right[i] as number))
  return value
}

export const rmsDb = (left: Float32Array, right: Float32Array, from = 0, to = left.length): number => {
  let sum = 0
  for (let i = from; i < to; i++) sum += (left[i] as number) ** 2 + (right[i] as number) ** 2
  return 10 * Math.log10(sum / (2 * (to - from)) + 1e-12)
}

export const allFinite = (data: Float32Array): boolean => data.every((value) => Number.isFinite(value))

/** Only `keep` plays: every other clip track is emptied (a track that is only muted still runs, so its sound is still there for others to listen to). */
export const only = (project: Project, keep: readonly string[]): Project => ({
  ...project,
  tracks: project.tracks.map((track): Track => (track.kind === 'return' || keep.includes(track.id) ? track : ({ ...track, clips: track.clips.map(() => null) } as Track))),
})

export const instrumentTracks = (project: Project): InstrumentTrack[] => project.tracks.filter((track): track is InstrumentTrack => track.kind === 'instrument')

export const trackOf = (project: Project, id: string): InstrumentTrack => project.tracks.find((track) => track.id === id) as InstrumentTrack

/** The scene in which the most clips play. */
export const busiestScene = (project: Project): number =>
  Array.from({ length: project.sceneCount }, (_, scene) => ({ scene, clips: instrumentTracks(project).filter((track) => track.clips[scene]).length })).sort((a, b) => b.clips - a.clips)[0]!.scene

/** Every graph a project holds: master, modules, and each track's instrument, effects and notes. */
export const everyGraph = (project: Project): Patch[] => [
  project.master.fx,
  ...project.modules.map((module) => module.patch),
  ...project.tracks.flatMap((track) => (track.kind === 'instrument' ? [track.patch, track.fx, track.noteGraph] : [track.fx])),
]

export const press = (patch: Patch, id: string): Patch => ({ ...patch, nodes: patch.nodes.map((node) => (node.id === id ? { ...node, params: { ...node.params, on: 1 } } : node)) })
