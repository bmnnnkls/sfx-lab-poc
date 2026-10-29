import { groupChain, groupsById } from './group-membership'
import type { GroupBus, Project, Track, TrackGroup } from './types'

/** Where a channel's sound goes and whether it is muted or soloed, worked out through the groups it is in. */
export interface ChannelRoute {
  /** The group whose bus it sums into, or null for the master. */
  readonly output: string | null
  /** Its own flag, or any enclosing group's. */
  readonly muted: boolean
  readonly soloed: boolean
}

const cache = new WeakMap<readonly Track[], { readonly groups: Project['groups']; readonly routes: ReadonlyMap<string, ChannelRoute> }>()

/**
 * The route of every channel the engine mixes, by id: each track and each group with a bus. A clip track or a bus goes
 * to the nearest enclosing group with a bus (a bus's own group doesn't count), else to the master; it is muted when it
 * or any enclosing group is, and soloed likewise. Returns go to the master with their own flags. The same map while
 * `tracks` and `groups` are.
 */
export const mixRouting = (project: Pick<Project, 'tracks' | 'groups'>): ReadonlyMap<string, ChannelRoute> => {
  const cached = cache.get(project.tracks)
  if (cached && cached.groups === project.groups) return cached.routes
  const byId = groupsById(project)
  const routes = new Map<string, ChannelRoute>()
  const routeOf = (own: { readonly muted?: boolean; readonly soloed?: boolean }, parentId: string | undefined): ChannelRoute => {
    const chain = groupChain(byId, parentId)
    return {
      output: [...chain].reverse().find((group) => group.bus)?.id ?? null,
      muted: (own.muted ?? false) || chain.some((group) => group.muted),
      soloed: (own.soloed ?? false) || chain.some((group) => group.soloed),
    }
  }
  for (const track of project.tracks) {
    routes.set(track.id, track.kind === 'return' ? { output: null, muted: track.muted ?? false, soloed: track.soloed ?? false } : routeOf(track, track.groupId))
  }
  for (const group of project.groups ?? []) if (group.bus) routes.set(group.id, routeOf(group, group.parentId))
  cache.set(project.tracks, { groups: project.groups, routes })
  return routes
}

export type BusGroup = TrackGroup & { readonly bus: GroupBus }

/** The groups with a bus. */
export const busGroups = (project: Pick<Project, 'groups'>): BusGroup[] => (project.groups ?? []).filter((group): group is BusGroup => !!group.bus)
