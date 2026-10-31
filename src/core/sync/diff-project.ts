import { compileAutomation } from '../automation'
import { projectWithControlValues } from '../control'
import type { EngineCommand } from '../engine'
import { type ModuleLibrary, type Patch, engineNoteGraph, flattenPatch } from '../patch'
import { type AudioTrack, type BusGroup, type ChannelRoute, type InstrumentTrack, type Project, type SendLevels, type Track, busGroups, mixRouting, panOf } from '../project'

/** Identity of a patch's wiring, ignoring params and canvas positions. */
const structureOf = (patch: Patch): string =>
  JSON.stringify([
    patch.nodes.map((node) => [node.id, node.type, node.stereo ?? false, node.trackId ?? null]),
    patch.connections.map(({ from, to }) => [from.node, from.port, to.node, to.port]),
  ])

/**
 * The engine only knows plain nodes, so module uses are expanded first. A knob on a module then reaches the
 * engine as an ordinary parameter change of an inner node, and editing a module's definition updates every
 * track that uses it.
 */
const diffPatch = (
  /** `patch` is the instrument's sound patch, `fx` a track's insert graph, `master` the master bus's. */
  slot: 'patch' | 'fx' | 'master',
  trackId: string,
  prevPatch: Patch,
  prevModules: ModuleLibrary,
  nextPatch: Patch,
  nextModules: ModuleLibrary,
): EngineCommand[] => {
  if (prevPatch === nextPatch && prevModules === nextModules) return []
  const prev = flattenPatch(prevPatch, prevModules)
  const next = flattenPatch(nextPatch, nextModules)
  if (prev === next) return []
  if (structureOf(prev) !== structureOf(next)) {
    return [
      slot === 'master'
        ? { type: 'master/setFx', graph: next }
        : slot === 'fx'
          ? { type: 'track/setFx', trackId, graph: next }
          : { type: 'track/setPatch', trackId, patch: next },
    ]
  }

  // Same wiring: push only what changed so knobs and pickers work without rebuilding the voice.
  const commands: EngineCommand[] = []
  for (const node of next.nodes) {
    const before = prev.nodes.find((candidate) => candidate.id === node.id)
    for (const [paramId, value] of Object.entries(node.params)) {
      if (before?.params[paramId] !== value) {
        commands.push(
          slot === 'master'
            ? { type: 'master/setParam', nodeId: node.id, paramId, value }
            : { type: 'track/setParam', graph: slot, trackId, nodeId: node.id, paramId, value },
        )
      }
    }
    if (before?.sampleId !== node.sampleId) {
      const sampleId = node.sampleId ?? null
      commands.push(
        slot === 'master'
          ? { type: 'master/setSample', nodeId: node.id, sampleId }
          : { type: 'track/setSample', trackId, nodeId: node.id, sampleId },
      )
    }
  }
  return commands
}

const sameClips = (a: readonly unknown[], b: readonly unknown[]): boolean =>
  a === b || (a.length === b.length && a.every((clip, index) => clip === b[index]))

/** What the note graph does, ignoring where its nodes sit on the canvas. */
const behaviourOf = (graph: Patch): string =>
  JSON.stringify([
    graph.nodes.map((node) => [node.id, node.type, node.params, node.trackId ?? null, node.bypassed ?? false]),
    graph.connections.map(({ from, to }) => [from.node, from.port, to.node, to.port]),
  ])

const diffInstrumentTrack = (
  prev: InstrumentTrack,
  next: InstrumentTrack,
  before: ModuleLibrary,
  after: ModuleLibrary,
): EngineCommand[] => {
  const commands = diffPatch('patch', next.id, prev.patch, before, next.patch, after)
  if (!sameClips(prev.clips, next.clips)) {
    commands.push({ type: 'track/setClips', trackId: next.id, clips: next.clips })
  }
  if (prev.noteGraph !== next.noteGraph || before !== after) {
    // Module uses are expanded first; the ids of expanded nodes are stable, so running nodes keep their state.
    const graph = engineNoteGraph(next.noteGraph, after)
    if (behaviourOf(engineNoteGraph(prev.noteGraph, before)) !== behaviourOf(graph)) {
      commands.push({ type: 'track/setNoteGraph', trackId: next.id, graph })
    }
  }
  if (prev.voices !== next.voices) {
    commands.push({ type: 'track/setVoices', trackId: next.id, voices: next.voices })
  }
  return commands
}

const diffAudioTrack = (prev: AudioTrack, next: AudioTrack): EngineCommand[] =>
  sameClips(prev.clips, next.clips)
    ? []
    : [{ type: 'track/setAudioClips', trackId: next.id, clips: next.clips }]

const sameSends = (a: SendLevels, b: SendLevels): boolean => {
  const keys = Object.keys(a)
  return a === b || (keys.length === Object.keys(b).length && keys.every((id) => a[id] === b[id]))
}

const diffTrack = (prev: Track, next: Track, before: ModuleLibrary, after: ModuleLibrary): EngineCommand[] => {
  const commands =
    prev.kind === 'instrument' && next.kind === 'instrument'
      ? diffInstrumentTrack(prev, next, before, after)
      : prev.kind === 'audio' && next.kind === 'audio'
        ? diffAudioTrack(prev, next)
        : []
  commands.push(...diffPatch('fx', next.id, prev.fx, before, next.fx, after))
  if (prev.kind !== 'return' && next.kind !== 'return' && !sameSends(prev.sends, next.sends)) {
    commands.push({ type: 'track/setSends', trackId: next.id, sends: next.sends })
  }
  if (prev.volume !== next.volume) {
    commands.push({ type: 'track/setVolume', trackId: next.id, volume: next.volume })
  }
  if (panOf(prev) !== panOf(next)) commands.push({ type: 'track/setPan', trackId: next.id, pan: panOf(next) })
  return commands
}

const NO_ROUTE: ChannelRoute = { output: null, muted: false, soloed: false }

/** Mute, solo and output as the engine takes them: the effective flags and the bus, through the groups. */
const routeFields = (route: ChannelRoute) => ({ muted: route.muted, soloed: route.soloed, ...(route.output !== null && { output: route.output }) })

/** What changed in a channel's route: its effective mute and solo, and the bus it sums into. */
const diffRoute = (id: string, prev: ChannelRoute, next: ChannelRoute): EngineCommand[] => [
  ...(prev.muted !== next.muted ? [{ type: 'track/setMute' as const, trackId: id, muted: next.muted }] : []),
  ...(prev.soloed !== next.soloed ? [{ type: 'track/setSolo' as const, trackId: id, soloed: next.soloed }] : []),
  ...(prev.output !== next.output ? [{ type: 'track/setOutput' as const, trackId: id, output: next.output }] : []),
]

const addBusCommand = (group: BusGroup, route: ChannelRoute, modules: ModuleLibrary): EngineCommand => ({
  type: 'track/add',
  kind: 'group',
  trackId: group.id,
  fx: flattenPatch(group.bus.fx, modules),
  volume: group.bus.volume,
  pan: group.bus.pan ?? 0,
  sends: group.bus.sends,
  ...routeFields(route),
})

/** A bus's graph, fader, pan and sends, as a track's. */
const diffBus = (prev: BusGroup, next: BusGroup, before: ModuleLibrary, after: ModuleLibrary): EngineCommand[] => {
  const commands = diffPatch('fx', next.id, prev.bus.fx, before, next.bus.fx, after)
  if (!sameSends(prev.bus.sends, next.bus.sends)) commands.push({ type: 'track/setSends', trackId: next.id, sends: next.bus.sends })
  if (prev.bus.volume !== next.bus.volume) commands.push({ type: 'track/setVolume', trackId: next.id, volume: next.bus.volume })
  if ((prev.bus.pan ?? 0) !== (next.bus.pan ?? 0)) commands.push({ type: 'track/setPan', trackId: next.id, pan: next.bus.pan ?? 0 })
  return commands
}

const addTrackCommand = (track: Track, route: ChannelRoute, modules: ModuleLibrary): EngineCommand => {
  const fx = flattenPatch(track.fx, modules)
  const mix = { volume: track.volume, pan: panOf(track), ...routeFields(route) }
  switch (track.kind) {
    case 'return':
      return { type: 'track/add', kind: 'return', trackId: track.id, fx, ...mix }
    case 'audio':
      return { type: 'track/add', kind: 'audio', trackId: track.id, fx, sends: track.sends, clips: track.clips, ...mix }
    case 'instrument':
      return {
        type: 'track/add',
        kind: 'instrument',
        trackId: track.id,
        patch: flattenPatch(track.patch, modules),
        noteGraph: engineNoteGraph(track.noteGraph, modules),
        fx,
        sends: track.sends,
        clips: track.clips,
        ...mix,
        voices: track.voices,
      }
  }
}

/** Commands that bring an engine holding `prev` (null = empty) in line with `next`. */
/**
 * A `sample/setLoop` for each sample whose loop differs from the previous project's: every sample's from nothing (so a
 * loaded project clears a loop another left in the bank), and a cleared one for a looped sample that left.
 */
const diffLoops = (prev: Project | null, next: Project): EngineCommand[] => {
  if (prev?.samples === next.samples) return []
  const before = new Map((prev?.samples ?? []).map((sample) => [sample.id, sample.loop]))
  const commands: EngineCommand[] = []
  for (const sample of next.samples) {
    const was = before.get(sample.id)
    const loop = sample.loop ?? null
    if (prev && was?.from === loop?.from && was?.to === loop?.to) continue
    commands.push({ type: 'sample/setLoop', sampleId: sample.id, loop })
  }
  const kept = new Set(next.samples.map((sample) => sample.id))
  for (const [sampleId, loop] of before) if (loop && !kept.has(sampleId)) commands.push({ type: 'sample/setLoop', sampleId, loop: null })
  return commands
}

export const diffProject = (prev: Project | null, next: Project, syncAutomation = true): EngineCommand[] => {
  const automation = syncAutomation ? compileAutomation(next) : []
  const automationChanged = syncAutomation && JSON.stringify(prev && compileAutomation(prev)) !== JSON.stringify(automation)
  prev = prev && projectWithControlValues(prev)
  next = projectWithControlValues(next)
  const commands: EngineCommand[] = []
  if (prev?.tempo !== next.tempo) commands.push({ type: 'transport/setTempo', bpm: next.tempo })
  commands.push(
    ...(prev === null
      ? [{ type: 'master/setFx' as const, graph: flattenPatch(next.master.fx, next.modules) }]
      : diffPatch('master', '', prev.master.fx, prev.modules, next.master.fx, next.modules)),
  )
  if ((prev?.master.volume ?? 1) !== (next.master.volume ?? 1)) {
    commands.push({ type: 'master/setVolume', volume: next.master.volume ?? 1 })
  }

  const before = prev?.modules ?? []
  const prevTracks = new Map((prev?.tracks ?? []).map((track) => [track.id, track]))
  const nextIds = new Set(next.tracks.map((track) => track.id))
  const prevBuses = new Map((prev ? busGroups(prev) : []).map((group) => [group.id, group]))
  const nextBuses = busGroups(next)
  const nextBusIds = new Set(nextBuses.map((group) => group.id))
  // A group's mute reaches its members, and a move into a bus group changes a track's output.
  const prevRoutes = prev ? mixRouting(prev) : new Map<string, ChannelRoute>()
  const nextRoutes = mixRouting(next)
  const routeOf = (id: string) => nextRoutes.get(id) ?? NO_ROUTE

  for (const id of prevTracks.keys()) {
    if (!nextIds.has(id)) commands.push({ type: 'track/remove', trackId: id })
  }
  for (const id of prevBuses.keys()) {
    if (!nextBusIds.has(id)) commands.push({ type: 'track/remove', trackId: id })
  }
  for (const track of next.tracks) {
    const existing = prevTracks.get(track.id)
    if (!existing) {
      commands.push(addTrackCommand(track, routeOf(track.id), next.modules))
      continue
    }
    if (existing.kind !== track.kind) {
      commands.push({ type: 'track/remove', trackId: track.id }, addTrackCommand(track, routeOf(track.id), next.modules))
      continue
    }
    if (existing !== track || before !== next.modules) commands.push(...diffTrack(existing, track, before, next.modules))
    commands.push(...diffRoute(track.id, prevRoutes.get(track.id) ?? NO_ROUTE, routeOf(track.id)))
  }
  for (const group of nextBuses) {
    const existing = prevBuses.get(group.id)
    if (!existing) {
      commands.push(addBusCommand(group, routeOf(group.id), next.modules))
      continue
    }
    if (existing !== group || before !== next.modules) commands.push(...diffBus(existing, group, before, next.modules))
    commands.push(...diffRoute(group.id, prevRoutes.get(group.id) ?? NO_ROUTE, routeOf(group.id)))
  }
  commands.push(...diffLoops(prev, next))
  // The arrangement is small, so it is pushed whole whenever it changed (edits create new arrays).
  if (prev?.arrangement !== next.arrangement) {
    commands.push({ type: 'arrangement/set', clips: next.arrangement ?? [] })
  }
  if (syncAutomation && automationChanged && (automation.length || prev)) commands.push({ type: 'automation/configure', tracks: automation })
  return commands
}
