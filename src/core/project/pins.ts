import type { ControlOwner } from '../control'
import type { Patch } from '../patch'
import { type PatchTarget, type TrackGraph, patchAt } from './module-edit'
import type { Project } from './types'

/** A front panel shown in the Pinned view: an owner's graph. A view field, saved with the project, never undone. */
export interface PanelPin {
  /** A track, a group (its bus), or the master. */
  readonly owner: ControlOwner
  /** Always 'fx' for a group or the master. */
  readonly graph: TrackGraph
  /** Shown as its header only; absent is false. */
  readonly collapsed?: boolean
}

/** A pin whose graph exists, with that graph. */
export interface LivePin {
  readonly pin: PanelPin
  readonly key: string
  readonly patch: Patch
}

/** The most pins a project has. */
export const MAX_PINS = 16

const ownerKey = (owner: ControlOwner): string => (owner.kind === 'track' ? owner.trackId : owner.kind === 'group' ? owner.groupId : 'master')

/** A pin's key, as `graphKey` writes it: `<owner id or master>:<graph>`. Two pins with one key are one pin. */
export const pinKey = (pin: Pick<PanelPin, 'owner' | 'graph'>): string => `${ownerKey(pin.owner)}:${pin.graph}`

/** Where a pin's graph lives, as the store's patch edits name it. */
export const pinTarget = (pin: Pick<PanelPin, 'owner' | 'graph'>): PatchTarget =>
  pin.owner.kind === 'track' ? { trackId: pin.owner.trackId, graph: pin.graph } : pin.owner.kind === 'group' ? { groupId: pin.owner.groupId } : { master: true }

/**
 * A pin's graph, or undefined when it is gone: the track or group is missing, the group has no bus, or the track's
 * kind has no such graph (an audio or return track has only `fx`). A group or the master has only `fx`.
 */
export const pinnedGraph = (project: Project, pin: Pick<PanelPin, 'owner' | 'graph'>): Patch | undefined =>
  pin.owner.kind !== 'track' && pin.graph !== 'fx' ? undefined : patchAt(project, pinTarget(pin))

const cache = new WeakMap<readonly PanelPin[], { readonly project: Project; readonly live: readonly LivePin[] }>()
const NONE: readonly LivePin[] = []

/**
 * The pins whose graph exists, in order, each with its graph. The same list while `pins`, `tracks`, `groups` and the
 * master are.
 */
export const livePins = (project: Project): readonly LivePin[] => {
  const pins = project.pins
  if (!pins) return NONE
  const cached = cache.get(pins)
  if (cached && cached.project.tracks === project.tracks && cached.project.groups === project.groups && cached.project.master === project.master) return cached.live
  const live = pins.flatMap((pin) => {
    const patch = pinnedGraph(project, pin)
    return patch ? [{ pin, key: pinKey(pin), patch }] : []
  })
  cache.set(pins, { project, live })
  return live
}

/** Whether a graph is pinned, shown or not. */
export const isPinned = (project: Project, pin: Pick<PanelPin, 'owner' | 'graph'>): boolean => {
  const key = pinKey(pin)
  return (project.pins ?? []).some((candidate) => pinKey(candidate) === key)
}

/** Whether `pinPanel` would add this pin: its graph exists, it isn't pinned, and there are fewer than `MAX_PINS`. */
export const canPin = (project: Project, pin: Pick<PanelPin, 'owner' | 'graph'>): boolean =>
  (project.pins?.length ?? 0) < MAX_PINS && !isPinned(project, pin) && pinnedGraph(project, pin) !== undefined

const withPins = (project: Project, pins: readonly PanelPin[]): Project => {
  if (pins.length > 0) return { ...project, pins }
  const { pins: _gone, ...rest } = project
  return rest
}

/** Pins a graph's panel at the bottom. The same project when it is pinned already, its graph is missing, or at `MAX_PINS`. */
export const pinPanel = (project: Project, pin: Pick<PanelPin, 'owner' | 'graph'>): Project =>
  canPin(project, pin) ? withPins(project, [...(project.pins ?? []), { owner: pin.owner, graph: pin.graph }]) : project

/** Unpins the pin with this key. */
export const unpinPanel = (project: Project, key: string): Project => {
  const pins = project.pins ?? []
  const kept = pins.filter((pin) => pinKey(pin) !== key)
  return kept.length === pins.length ? project : withPins(project, kept)
}

/**
 * Moves a pin one place up (-1) or down (1) among the shown pins, so a pin that isn't shown never stalls a move. It
 * takes the place of the shown pin it passes. The same project at either end.
 */
export const movePin = (project: Project, key: string, direction: -1 | 1): Project => {
  const live = livePins(project)
  const at = live.findIndex((entry) => entry.key === key)
  const other = live[at + direction]
  if (at === -1 || !other) return project
  const pins = project.pins!
  const from = pins.indexOf(live[at]!.pin)
  const to = pins.indexOf(other.pin)
  const moved = [...pins]
  moved[from] = other.pin
  moved[to] = live[at]!.pin
  return withPins(project, moved)
}

/** Shows a pin as its header only, or whole. A collapsed pin saves `collapsed: true`; an expanded one nothing. */
export const setPinCollapsed = (project: Project, key: string, collapsed: boolean): Project => {
  const pins = project.pins ?? []
  const at = pins.findIndex((pin) => pinKey(pin) === key)
  const pin = pins[at]
  if (!pin || (pin.collapsed ?? false) === collapsed) return project
  const { collapsed: _was, ...rest } = pin
  return withPins(project, pins.map((candidate, index) => (index !== at ? candidate : collapsed ? { ...rest, collapsed: true } : rest)))
}

/** Whether a project has a pin's owner: the track, the group, or the master. */
const hasOwner = (project: Project, owner: ControlOwner, master: boolean): boolean =>
  owner.kind === 'track' ? project.tracks.some((track) => track.id === owner.trackId)
    : owner.kind === 'group' ? (project.groups ?? []).some((group) => group.id === owner.groupId)
    : master

/**
 * The pins `restored` (what undo or redo brings back) shows: the current ones, then those of `restored` whose owner the
 * current project doesn't have, in their order, keys not repeated. The master counts as the current project's only
 * when the two share a track: otherwise `restored` is another document (*New*, *Import*, *Restore*) and its master
 * pin comes back with it. `restored` itself when its pins are those.
 */
export const withPinsOf = (restored: Project, current: Project): Project => {
  const sameDocument = current.tracks.some((track) => restored.tracks.some((candidate) => candidate.id === track.id))
  const pins = [...(current.pins ?? [])]
  const keys = new Set(pins.map(pinKey))
  for (const pin of restored.pins ?? []) {
    if (keys.has(pinKey(pin)) || hasOwner(current, pin.owner, sameDocument)) continue
    keys.add(pinKey(pin))
    pins.push(pin)
  }
  const before = restored.pins ?? []
  return pins.length === before.length && pins.every((pin, index) => pin === before[index]) ? restored : withPins(restored, pins)
}
