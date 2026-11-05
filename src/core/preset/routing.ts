import { controlGraph } from '../control'
import type { Patch } from '../patch'
import type { Project } from '../project'
import { EXTERNAL_ROUTING } from './assets'
import type { SnapshotScope } from './types'

/** A node that reads another track, which a capture refuses: its type, and the track it reads or sends to. */
export interface ExternalRouting {
  readonly nodeType: string
  readonly trackId?: string
}

/**
 * The first `send`, `trackAudio` or `trackNotes` node in the graph a capture of `scope` reads, its modules' included
 * (and an instrument's note graph), or undefined when it reads none. A scan of node types only, cheap enough for
 * `dragover`; `captureAsset` refuses the same nodes.
 */
export const externalRoutingIn = (project: Project, scope: SnapshotScope): ExternalRouting | undefined => {
  if (scope.domain === 'track') return undefined
  const graph = controlGraph(project, scope.owner, scope.domain)
  if (!graph) return undefined
  const track = scope.owner.kind === 'track' && scope.domain === 'patch' ? project.tracks.find((candidate) => scope.owner.kind === 'track' && candidate.id === scope.owner.trackId) : undefined
  const seen = new Set<string>()
  const scan = (patch: Patch): ExternalRouting | undefined => {
    for (const node of patch.nodes) {
      if (EXTERNAL_ROUTING.includes(node.type)) return { nodeType: node.type, ...(node.trackId !== undefined && { trackId: node.trackId }) }
      if (node.type !== 'module' || !node.moduleId || seen.has(node.moduleId)) continue
      seen.add(node.moduleId)
      const module = project.modules.find((candidate) => candidate.id === node.moduleId)
      const found = module && scan(module.patch)
      if (found) return found
    }
    return undefined
  }
  return scan(graph) ?? (track?.kind === 'instrument' ? scan(track.noteGraph) : undefined)
}
