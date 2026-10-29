import { type ModuleDefinition, type Patch, clearSampleReferences, replaceSampleReferences } from '../patch'
import type { AssetPayload, SampleBinding } from '../preset'
import { type SampleInfo, type SampleMarker, type SampleRegion, type SampleRemap, originOf } from '../sample'
import { MIN_REGION, clampAudioClip } from './audio-clip'
import { isAudioContent } from './arrangement-clip'
import { mapMasterFx, mapModules } from './edit'
import { mapBusGraphs } from './group-membership'
import type { AudioClip, Project, Track } from './types'

/**
 * Every place a project uses a library sample, one visitor each. `usedSampleIds`, `projectSampleDependencies`,
 * `removeSample` and `replaceSample` are all built from this list, so a new place is added once and none of them can
 * forget it. Order matters: it is the order `usedSampleIds` lists samples in.
 */

/** What `replaceSample` counts while it moves uses: trims the edit took all the audio of. */
interface TrimCount {
  emptiedTrims: number
}

export interface SampleUse {
  readonly id: string
  /** Whether the sample sounds from here (`usedSampleIds`), or is only kept for later (presets, revisions). */
  readonly plays: boolean
  collect(project: Project, add: (sampleId: string) => void): void
  /** Points the uses of `from` at `to`, through `remap` where positions matter. Nothing to change keeps the project. */
  replace(project: Project, from: string, to: string, remap: SampleRemap, count: TrimCount): Project
  /** Clears the uses of `id`. Nothing to change keeps the project. */
  remove(project: Project, id: string): Project
}

const collectPatch = (patch: Patch, add: (sampleId: string) => void) => {
  for (const node of patch.nodes) if (node.sampleId !== undefined) add(node.sampleId)
}

/** A clip's trim after an edit, so it plays the audio it played. One the edit emptied keeps the smallest trim where it started. */
const remapClip = (clip: AudioClip, to: string, remap: SampleRemap, count: TrimCount): AudioClip => {
  const { fromFrames, toFrames } = remap
  const from = clip.start * fromFrames
  const end = clip.end * fromFrames
  if (remap.identity && fromFrames === toFrames) return { ...clip, sampleId: to }
  const range = remap.range({ from, to: end })
  if (!range) {
    count.emptiedTrims += 1
    const start = remap.start(from) / toFrames
    return clampAudioClip({ ...clip, sampleId: to, start, end: start + MIN_REGION })
  }
  // A range that didn't move keeps its fractions exactly.
  if (range.from === from && range.to === end && fromFrames === toFrames) return { ...clip, sampleId: to }
  return clampAudioClip({ ...clip, sampleId: to, start: range.from / toFrames, end: range.to / toFrames })
}

const mapTracks = (project: Project, change: (track: Track) => Track): Project => {
  const tracks = project.tracks.map(change)
  return tracks.every((track, index) => track === project.tracks[index]) ? project : { ...project, tracks }
}

/** A track's patches (insert graph, instrument) changed by `patch`, and its session audio clips by `clip`. */
const mapTrack = (track: Track, patch: (patch: Patch) => Patch, clip: (clip: AudioClip) => AudioClip | null): Track => {
  const fx = patch(track.fx)
  const base = fx === track.fx ? track : { ...track, fx }
  if (base.kind === 'return') return base
  if (base.kind === 'audio') {
    const clips = base.clips.map((slot) => (slot ? clip(slot) : slot))
    return clips.some((slot, index) => slot !== base.clips[index]) ? { ...base, clips } : base
  }
  const instrument = patch(base.patch)
  return instrument === base.patch ? base : { ...base, patch: instrument }
}

const mapBindings = (bindings: readonly SampleBinding[], from: string, to: string | null): readonly SampleBinding[] =>
  bindings.some((binding) => binding.sampleId === from)
    ? bindings.map((binding) => (binding.sampleId === from ? { ...binding, sampleId: to } : binding))
    : bindings

const mapPayload = (payload: AssetPayload, from: string, to: string): AssetPayload => {
  const patch = (graph: Patch) => replaceSampleReferences(graph, from, to)
  const modules = mapModules(payload.modules, (module: ModuleDefinition) => {
    const next = patch(module.patch)
    return next === module.patch ? module : { ...module, patch: next }
  })
  const sampleIds = payload.sampleIds.includes(from) ? [...new Set(payload.sampleIds.map((id) => (id === from ? to : id)))] : payload.sampleIds
  if (payload.kind === 'instrument') {
    const [main, notes] = [patch(payload.patch), patch(payload.noteGraph)]
    if (main === payload.patch && notes === payload.noteGraph && modules === payload.modules && sampleIds === payload.sampleIds) return payload
    return { ...payload, patch: main, noteGraph: notes, modules, sampleIds }
  }
  const graph = patch(payload.graph)
  if (graph === payload.graph && modules === payload.modules && sampleIds === payload.sampleIds) return payload
  return { ...payload, graph, modules, sampleIds }
}

/** The places, in `usedSampleIds` order. */
export const SAMPLE_USES: readonly SampleUse[] = [
  {
    id: 'master',
    plays: true,
    collect: (project, add) => collectPatch(project.master.fx, add),
    replace: (project, from, to) => {
      const master = mapMasterFx(project.master, (fx) => replaceSampleReferences(fx, from, to))
      return master === project.master ? project : { ...project, master }
    },
    remove: (project, id) => {
      const master = mapMasterFx(project.master, (fx) => clearSampleReferences(fx, id))
      return master === project.master ? project : { ...project, master }
    },
  },
  {
    id: 'buses',
    plays: true,
    collect: (project, add) => {
      for (const group of project.groups ?? []) if (group.bus) collectPatch(group.bus.fx, add)
    },
    replace: (project, from, to) => {
      const groups = mapBusGraphs(project.groups, (fx) => replaceSampleReferences(fx, from, to))
      return groups === project.groups ? project : { ...project, groups }
    },
    remove: (project, id) => {
      const groups = mapBusGraphs(project.groups, (fx) => clearSampleReferences(fx, id))
      return groups === project.groups ? project : { ...project, groups }
    },
  },
  {
    id: 'modules',
    plays: true,
    collect: (project, add) => {
      for (const module of project.modules) collectPatch(module.patch, add)
    },
    replace: (project, from, to) => {
      const modules = mapModules(project.modules, (module) => {
        const patch = replaceSampleReferences(module.patch, from, to)
        return patch === module.patch ? module : { ...module, patch }
      })
      return modules === project.modules ? project : { ...project, modules }
    },
    remove: (project, id) => {
      const modules = mapModules(project.modules, (module) => {
        const patch = clearSampleReferences(module.patch, id)
        return patch === module.patch ? module : { ...module, patch }
      })
      return modules === project.modules ? project : { ...project, modules }
    },
  },
  {
    // One visitor for a track's insert graph, its instrument and its session audio clips, so samples are listed track by track.
    id: 'tracks',
    plays: true,
    collect: (project, add) => {
      for (const track of project.tracks) {
        collectPatch(track.fx, add)
        if (track.kind === 'instrument') collectPatch(track.patch, add)
        if (track.kind === 'audio') for (const clip of track.clips) if (clip) add(clip.sampleId)
      }
    },
    replace: (project, from, to, remap, count) =>
      mapTracks(project, (track) =>
        mapTrack(track, (patch) => replaceSampleReferences(patch, from, to), (clip) => (clip.sampleId === from ? remapClip(clip, to, remap, count) : clip)),
      ),
    remove: (project, id) =>
      mapTracks(project, (track) => mapTrack(track, (patch) => clearSampleReferences(patch, id), (clip) => (clip.sampleId === id ? null : clip))),
  },
  {
    id: 'arrangement',
    plays: true,
    collect: (project, add) => {
      for (const region of project.arrangement ?? []) if (isAudioContent(region.content)) add(region.content.sampleId)
    },
    replace: (project, from, to, remap, count) => {
      const regions = project.arrangement ?? []
      if (!regions.some((region) => isAudioContent(region.content) && region.content.sampleId === from)) return project
      return {
        ...project,
        arrangement: regions.map((region) =>
          isAudioContent(region.content) && region.content.sampleId === from ? { ...region, content: remapClip(region.content, to, remap, count) } : region,
        ),
      }
    },
    remove: (project, id) => {
      const regions = project.arrangement ?? []
      const kept = regions.filter((region) => !(isAudioContent(region.content) && region.content.sampleId === id))
      return kept.length === regions.length ? project : { ...project, arrangement: kept }
    },
  },
  {
    id: 'bindings',
    plays: true,
    collect: (project, add) => {
      for (const binding of project.sampleBindings ?? []) if (binding.sampleId) add(binding.sampleId)
    },
    replace: (project, from, to) => {
      if (!project.sampleBindings) return project
      const sampleBindings = mapBindings(project.sampleBindings, from, to)
      return sampleBindings === project.sampleBindings ? project : { ...project, sampleBindings }
    },
    remove: (project, id) => {
      if (!project.sampleBindings) return project
      const sampleBindings = mapBindings(project.sampleBindings, id, null)
      return sampleBindings === project.sampleBindings ? project : { ...project, sampleBindings }
    },
  },
  {
    // Removing a sample leaves presets naming it: recalling one then says the sample is missing.
    id: 'presets',
    plays: false,
    collect: (project, add) => {
      for (const preset of project.presets ?? []) for (const binding of preset.samples) if (binding.sampleId) add(binding.sampleId)
    },
    replace: (project, from, to) => {
      if (!project.presets) return project
      const presets = project.presets.map((preset) => {
        const samples = mapBindings(preset.samples, from, to)
        return samples === preset.samples ? preset : { ...preset, samples }
      })
      return presets.every((preset, index) => preset === project.presets![index]) ? project : { ...project, presets }
    },
    remove: (project) => project,
  },
  {
    // Revisions are immutable records of what was saved; their signatures ignore samples, so repointing one changes none.
    id: 'revisions',
    plays: false,
    collect: (project, add) => {
      for (const revision of project.assetRevisions ?? []) for (const id of revision.payload.sampleIds) add(id)
    },
    replace: (project, from, to) => {
      if (!project.assetRevisions) return project
      const assetRevisions = project.assetRevisions.map((revision) => {
        const payload = mapPayload(revision.payload, from, to)
        return payload === revision.payload ? revision : { ...revision, payload }
      })
      return assetRevisions.every((revision, index) => revision === project.assetRevisions![index]) ? project : { ...project, assetRevisions }
    },
    remove: (project) => project,
  },
]

const collect = (project: Project, uses: readonly SampleUse[]): string[] => {
  const found = new Set<string>()
  for (const use of uses) use.collect(project, (id) => found.add(id))
  return [...found]
}

/**
 * The library samples the project actually plays: those of its audio clips (session and arrangement) and of the sampler
 * nodes in any patch (instruments, insert graphs, buses, the master, modules). In first-use order, each once. A bounce decodes
 * just these, not the whole library.
 */
export const usedSampleIds = (project: Project): string[] => collect(project, SAMPLE_USES.filter((use) => use.plays))

/** Dependency closure for project and library packaging, including saved sounds which are not playing. */
export const projectSampleDependencies = (project: Project): string[] => collect(project, SAMPLE_USES)

/**
 * Removes a sample from the library and clears every use of it: sampler nodes lose it, session audio clips and
 * arrangement regions that play it go, sample bindings fall silent. Presets and revisions keep naming it.
 */
export const removeSample = (project: Project, sampleId: string): Project => {
  const cleared = SAMPLE_USES.reduce<Project>((next, use) => use.remove(next, sampleId), project)
  return { ...cleared, samples: cleared.samples.filter((sample) => sample.id !== sampleId) }
}

/** What `replaceSample` did besides moving the uses. */
export interface SampleReplaceReport {
  /** The library entry the result already was, which the uses now point at; the edited entry is gone. */
  readonly merged: SampleInfo | null
  /** How many clips and regions played only audio the edit removed; each keeps the smallest trim where it started. */
  readonly emptiedTrims: number
}

const remapMarkers = (markers: readonly SampleMarker[], remap: SampleRemap): SampleMarker[] =>
  markers.flatMap((marker) => {
    const frame = remap.frame(marker.frame)
    return frame === null ? [] : [{ ...marker, frame: Math.max(0, Math.min(remap.toFrames, frame)) }]
  })

const remapRegions = (regions: readonly SampleRegion[], remap: SampleRemap): SampleRegion[] =>
  regions.flatMap((region) => {
    const range = remap.range(region)
    if (!range) return []
    const [from, to] = [Math.max(0, range.from), Math.min(remap.toFrames, range.to)]
    return to > from ? [{ ...region, from, to }] : []
  })

/**
 * Moves every use of sample `fromId` onto `to`, the result of an edit: the library entry is replaced where it is (with
 * the old name, its origin, and its markers and regions remapped), and every sampler, binding, preset, revision, clip and
 * region points at `to.id`, with clips' and regions' trims through `remap` so they keep playing the audio they played. If
 * `to.id` is already in the library, the edited entry goes and the uses point at that one (`report.merged`). The
 * sampler's *Start* param is left alone: it is a param, not a trim.
 */
export const replaceSample = (
  project: Project,
  fromId: string,
  to: SampleInfo,
  remap: SampleRemap,
): { project: Project; report: SampleReplaceReport } => {
  const old = project.samples.find((sample) => sample.id === fromId)
  if (!old || to.id === fromId) return { project, report: { merged: null, emptiedTrims: 0 } }
  const merged = project.samples.find((sample) => sample.id === to.id) ?? null
  const replaced: SampleInfo = {
    ...to,
    name: old.name,
    origin: originOf(old),
    ...(old.markers && { markers: remapMarkers(old.markers, remap) }),
    ...(old.regions && { regions: remapRegions(old.regions, remap) }),
  }
  const samples = merged ? project.samples.filter((sample) => sample.id !== fromId) : project.samples.map((sample) => (sample.id === fromId ? replaced : sample))
  const count: TrimCount = { emptiedTrims: 0 }
  const moved = SAMPLE_USES.reduce<Project>((next, use) => use.replace(next, fromId, to.id, remap, count), { ...project, samples })
  return { project: moved, report: { merged, emptiedTrims: count.emptiedTrims } }
}
