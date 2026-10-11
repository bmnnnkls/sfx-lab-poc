import { createDefaultPatch, setNodeParam } from '../patch'
import type { Patch } from '../patch'
import { addTrack, createClip, createTrack, setClipAt } from './edit'
import type { Note, Project } from './types'

const SCENES = 4

const notes = (pitches: ReadonlyArray<number | null>, step: number, length: number): Note[] =>
  pitches.flatMap((pitch, index) =>
    pitch === null ? [] : [{ pitch, start: index * step, duration: length, velocity: 0.9 }],
  )

const tweak = (patch: Patch, type: string, params: Record<string, number>): Patch => {
  const node = patch.nodes.find((candidate) => candidate.type === type)
  if (!node) return patch
  return Object.entries(params).reduce((next, [id, value]) => setNodeParam(next, node.id, id, value), patch)
}

/** A small starter session so the app makes sound on the first click. */
export const createDemoProject = (): Project => {
  let project: Project = { tempo: 110, sceneCount: SCENES, tracks: [] }

  const bass = createTrack('Bass', SCENES, tweak(createDefaultPatch(), 'filter', { cutoff: 700 }))
  const lead = createTrack('Lead', SCENES, tweak(createDefaultPatch(), 'oscillator', { waveform: 2 }))
  const pad = createTrack(
    'Pad',
    SCENES,
    tweak(tweak(createDefaultPatch(), 'envelope', { attack: 0.4, release: 1.2 }), 'oscillator', { waveform: 3 }),
  )

  const clips = [
    [bass, 0, createClip('Root', 4, notes([36, null, 36, 43, 36, null, 39, 41], 0.5, 0.4))],
    [bass, 1, createClip('Walk', 4, notes([36, 38, 39, 41, 43, 41, 39, 38], 0.5, 0.4))],
    [lead, 0, createClip('Arp', 4, notes([60, 63, 67, 72, 67, 63, 60, 63], 0.5, 0.3))],
    [lead, 2, createClip('Hook', 4, notes([72, null, 70, 67, null, 63, 67, null], 0.5, 0.4))],
    [pad, 0, createClip('Cm', 8, [60, 63, 67].map((pitch) => ({ pitch, start: 0, duration: 8, velocity: 0.7 })))],
    [pad, 1, createClip('Ab', 8, [56, 60, 63].map((pitch) => ({ pitch, start: 0, duration: 8, velocity: 0.7 })))],
  ] as const

  project = [bass, lead, pad].reduce(addTrack, project)
  for (const [track, scene, clip] of clips) {
    project = setClipAt(project, track.id, scene, clip)
  }
  return project
}
