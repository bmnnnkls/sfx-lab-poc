import { audioSources, flattenPatch, sendTargets } from '../patch'
import { busGroups, mixRouting } from './group-routing'
import type { Project, ReturnTrack, Track } from './types'

/** What the dependency rules below need to know about a project. Its ids are tracks' and buses' (groups with a bus). */
export type MixGraph = Pick<Project, 'tracks' | 'groups' | 'modules'>

/** Ids of the tracks a track takes audio from with Track audio nodes (looking inside modules too). */
export const audioSourcesOf = (graph: Pick<Project, 'modules'>, track: Track): string[] => audioSources(flattenPatch(track.fx, graph.modules))

/** Ids of the return tracks a track's insert graph sends to (looking inside modules too). */
export const sendTargetsOf = (graph: Pick<Project, 'modules'>, track: Track): string[] => sendTargets(flattenPatch(track.fx, graph.modules))

const cache = new WeakMap<readonly Track[], { readonly groups: MixGraph['groups']; readonly modules: MixGraph['modules']; readonly deps: ReadonlyMap<string, readonly string[]> }>()

/** Every channel's dependencies, worked out once per `tracks`, `groups` and `modules`. */
const dependencies = (graph: MixGraph): ReadonlyMap<string, readonly string[]> => {
  const cached = cache.get(graph.tracks)
  if (cached && cached.groups === graph.groups && cached.modules === graph.modules) return cached.deps
  const deps = new Map<string, Set<string>>()
  const returns = new Set(graph.tracks.flatMap((track) => (track.kind === 'return' ? [track.id] : [])))
  const add = (id: string, dep: string) => {
    let set = deps.get(id)
    if (!set) deps.set(id, (set = new Set()))
    set.add(dep)
  }
  const channel = (id: string, fx: Track['fx'], sends: Readonly<Record<string, number>>) => {
    const flat = flattenPatch(fx, graph.modules)
    for (const source of audioSources(flat)) add(id, source)
    for (const target of sendTargets(flat)) if (returns.has(target)) add(target, id)
    for (const [target, level] of Object.entries(sends)) if (level > 0 && returns.has(target)) add(target, id)
  }
  for (const track of graph.tracks) channel(track.id, track.fx, track.kind === 'return' ? {} : track.sends)
  for (const group of busGroups(graph)) channel(group.id, group.bus.fx, group.bus.sends)
  for (const [id, route] of mixRouting(graph)) if (route.output !== null) add(route.output, id)
  const result = new Map([...deps].map(([id, set]) => [id, [...set]]))
  cache.set(graph.tracks, { groups: graph.groups, modules: graph.modules, deps: result })
  return result
}

/**
 * The channels that must be mixed before `id`: the tracks it takes audio from, for a return track the tracks and buses
 * that send to it (with a Send node or a send knob), and for a bus the tracks and buses that sum into it. Notes taken
 * from other tracks are not part of this: they are passed on before any sound is mixed, so they have their own order.
 */
export const mixDependencies = (graph: MixGraph, id: string): string[] => {
  const known = graph.tracks.some((track) => track.id === id) || busGroups(graph).some((group) => group.id === id)
  return known ? [...(dependencies(graph).get(id) ?? [])] : []
}

/** True when `id` is mixed after `target`, directly or through other channels. */
export const mixesAfter = (graph: MixGraph, id: string, target: string, seen = new Set<string>()): boolean => {
  if (seen.has(id)) return false
  seen.add(id)
  return (dependencies(graph).get(id) ?? []).some((dep) => dep === target || mixesAfter(graph, dep, target, seen))
}

/** True when some channel would have to be mixed after itself. The editor refuses such edits, and files are repaired. */
export const hasMixLoop = (graph: MixGraph): boolean => {
  const deps = dependencies(graph)
  const state = new Map<string, 'open' | 'done'>()
  const visit = (id: string): boolean => {
    const now = state.get(id)
    if (now) return now === 'open'
    state.set(id, 'open')
    if ((deps.get(id) ?? []).some(visit)) return true
    state.set(id, 'done')
    return false
  }
  return [...deps.keys()].some(visit)
}

/**
 * The return tracks `id` (a track or a bus) may send to: every other return track that is not (however indirectly)
 * mixed before it, which would make the two depend on each other. Any track may send to any return; a return may send
 * to a later one.
 */
export const sendableReturns = (graph: MixGraph, id: string): ReturnTrack[] =>
  graph.tracks.flatMap((track) =>
    track.kind === 'return' && track.id !== id && !mixesAfter(graph, id, track.id) ? [track] : [],
  )

/**
 * The tracks `id` (a track or a bus) may take audio from: every other track that is not (however indirectly) mixed
 * after it, which would make the two depend on each other. A bus is never a source.
 */
export const audioSourceTracks = (graph: MixGraph, id: string): Track[] =>
  graph.tracks.filter((track) => track.id !== id && !mixesAfter(graph, track.id, id))
