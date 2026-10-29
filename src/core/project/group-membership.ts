import type { Patch } from '../patch'
import type { GroupBus, Project, TrackGroup } from './types'

/** The groups from the top level down to the one `groupId` names: empty for none or an unknown id, cut at a cycle. */
export const groupChain = (groups: ReadonlyMap<string, TrackGroup>, groupId: string | undefined): TrackGroup[] => {
  const chain: TrackGroup[] = []
  for (
    let group = groupId === undefined ? undefined : groups.get(groupId);
    group && !chain.includes(group);
    group = group.parentId === undefined ? undefined : groups.get(group.parentId)
  ) chain.unshift(group)
  return chain
}

export const groupsById = (project: Pick<Project, 'groups'>): ReadonlyMap<string, TrackGroup> =>
  new Map((project.groups ?? []).map((group) => [group.id, group]))

/** Without the groups that have no track left in them or in a group nested in them; the same project when none went. */
export const pruneGroups = (project: Project): Project => {
  if (!project.groups) return project
  const byId = groupsById(project)
  const used = new Set<string>()
  for (const track of project.tracks) {
    if (track.kind === 'return') continue
    for (const group of groupChain(byId, track.groupId)) used.add(group.id)
  }
  if (used.size === project.groups.length) return project
  const groups = project.groups.filter((group) => used.has(group.id))
  if (groups.length) return { ...project, groups }
  const { groups: _gone, ...rest } = project
  return rest
}

/** `change` applied to every bus; the same groups when no bus changed. */
export const mapBuses = (groups: Project['groups'], change: (bus: GroupBus) => GroupBus): Project['groups'] => {
  if (!groups) return groups
  let changed = false
  const next = groups.map((group) => {
    const bus = group.bus && change(group.bus)
    if (bus === group.bus) return group
    changed = true
    return { ...group, bus }
  })
  return changed ? next : groups
}

/** `change` applied to every bus's graph; the same groups when none changed. */
export const mapBusGraphs = (groups: Project['groups'], change: (fx: Patch) => Patch): Project['groups'] =>
  mapBuses(groups, (bus) => {
    const fx = change(bus.fx)
    return fx === bus.fx ? bus : { ...bus, fx }
  })
