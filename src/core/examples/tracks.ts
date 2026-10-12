import type { ModuleDefinition, Patch } from '../patch'
import { patchOf } from './builder'
import {
  type Clip,
  type InstrumentTrack,
  type Project,
  type ReturnTrack,
  createMasterBus,
  createReturnTrack,
  createTrack,
} from '../project'

/** A track as the examples write it down: ids are chosen (so the project is the same every time) and clips sit in scenes by number. */
export interface InstrumentSpec {
  readonly id: string
  readonly name: string
  readonly patch: Patch
  /** The notes between the clips and the instrument. Absent: straight through. */
  readonly notes?: Patch
  /** The insert graph. Absent: the sound straight through. */
  readonly fx?: Patch
  readonly voices?: number
  /** The fader, 0..1. */
  readonly volume?: number
  /** -1 left .. 1 right. */
  readonly pan?: number
  /** Send knobs: return track id -> level 0..1 (taken after the fader). */
  readonly sends?: Readonly<Record<string, number>>
  /** The clip of each scene (a scene with none is empty). */
  readonly clips: Readonly<Record<number, Clip>>
}

/** The graphs a track starts with, with ids that are the same every time (the app's own defaults take random ones). */
const plainFx = (): Patch => patchOf([{ id: 'in', type: 'trackIn' }, { id: 'out', type: 'trackOut' }], ['in.out>out.in'], { prefix: 'fx_' })
const plainNotes = (): Patch => patchOf([{ id: 'clip', type: 'clipNotes' }, { id: 'out', type: 'noteOut' }], ['clip.out>out.in'], { prefix: 'ng_' })

export const instrumentTrack = (spec: InstrumentSpec, sceneCount: number): InstrumentTrack => {
  const base = createTrack(spec.name, sceneCount, spec.patch, spec.voices)
  return {
    ...base,
    id: spec.id,
    volume: spec.volume ?? 0.8,
    ...(spec.pan === undefined || spec.pan === 0 ? {} : { pan: spec.pan }),
    sends: spec.sends ?? {},
    fx: spec.fx ?? plainFx(),
    noteGraph: spec.notes ?? plainNotes(),
    clips: Array.from({ length: sceneCount }, (_, scene) => spec.clips[scene] ?? null),
  }
}

export interface ReturnSpec {
  readonly id: string
  readonly name: string
  readonly fx: Patch
  readonly volume?: number
}

export const returnOf = (spec: ReturnSpec): ReturnTrack => ({ ...createReturnTrack(spec.name), id: spec.id, fx: spec.fx, volume: spec.volume ?? 0.8 })

export interface ProjectSpec {
  readonly name: string
  readonly tempo: number
  readonly sceneCount: number
  /** One name per scene. */
  readonly sceneNames: readonly string[]
  readonly modules: readonly ModuleDefinition[]
  /** The final mix: a graph from `Master in` to `Track out`, and the master fader. */
  readonly master: { readonly fx: Patch; readonly volume?: number }
  readonly tracks: readonly InstrumentSpec[]
  readonly returns: readonly ReturnSpec[]
}

/** The project: clip tracks in the order written, then the return tracks, as the session view shows them. */
export const projectOf = (spec: ProjectSpec): Project => ({
  name: spec.name,
  tempo: spec.tempo,
  sceneCount: spec.sceneCount,
  sceneNames: spec.sceneNames,
  samples: [],
  modules: spec.modules,
  master: { ...createMasterBus(), fx: spec.master.fx, ...(spec.master.volume === undefined || spec.master.volume === 1 ? {} : { volume: spec.master.volume }) },
  tracks: [...spec.tracks.map((track) => instrumentTrack(track, spec.sceneCount)), ...spec.returns.map(returnOf)],
})
