import type { EngineCommand } from '../engine'
import type { Patch } from '../patch'
import type { Project, Track } from '../project'

/** Identity of a patch's wiring, ignoring params and canvas positions. */
const structureOf = (patch: Patch): string =>
  JSON.stringify([
    patch.nodes.map((node) => [node.id, node.type]),
    patch.connections.map(({ from, to }) => [from.node, from.port, to.node, to.port]),
  ])

const diffPatch = (trackId: string, prev: Patch, next: Patch): EngineCommand[] => {
  if (prev === next) return []
  if (structureOf(prev) !== structureOf(next)) return [{ type: 'track/setPatch', trackId, patch: next }]

  // Same wiring: push only changed params so knobs can move without rebuilding the voice.
  const commands: EngineCommand[] = []
  for (const node of next.nodes) {
    const before = prev.nodes.find((candidate) => candidate.id === node.id)?.params ?? {}
    for (const [paramId, value] of Object.entries(node.params)) {
      if (before[paramId] !== value) {
        commands.push({ type: 'track/setParam', trackId, nodeId: node.id, paramId, value })
      }
    }
  }
  return commands
}

const sameClips = (a: Track['clips'], b: Track['clips']): boolean =>
  a === b || (a.length === b.length && a.every((clip, index) => clip === b[index]))

const diffTrack = (prev: Track, next: Track): EngineCommand[] => {
  const commands = diffPatch(next.id, prev.patch, next.patch)
  if (!sameClips(prev.clips, next.clips)) {
    commands.push({ type: 'track/setClips', trackId: next.id, clips: next.clips })
  }
  if (prev.volume !== next.volume) {
    commands.push({ type: 'track/setVolume', trackId: next.id, volume: next.volume })
  }
  return commands
}

/** Commands that bring an engine holding `prev` (null = empty) in line with `next`. */
export const diffProject = (prev: Project | null, next: Project): EngineCommand[] => {
  const commands: EngineCommand[] = []
  if (prev?.tempo !== next.tempo) commands.push({ type: 'transport/setTempo', bpm: next.tempo })

  const prevTracks = new Map((prev?.tracks ?? []).map((track) => [track.id, track]))
  const nextIds = new Set(next.tracks.map((track) => track.id))

  for (const id of prevTracks.keys()) {
    if (!nextIds.has(id)) commands.push({ type: 'track/remove', trackId: id })
  }
  for (const track of next.tracks) {
    const before = prevTracks.get(track.id)
    if (!before) {
      commands.push({
        type: 'track/add',
        trackId: track.id,
        patch: track.patch,
        clips: track.clips,
        volume: track.volume,
      })
    } else if (before !== track) {
      commands.push(...diffTrack(before, track))
    }
  }
  return commands
}
