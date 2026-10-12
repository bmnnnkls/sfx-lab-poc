import type { Patch } from '../patch'
import type { Project } from './types'

/**
 * The library samples the project actually plays: those of its audio clips and of the sampler nodes in any patch (instruments, insert
 * graphs, the master, modules). In first-use order, each once. A bounce decodes just these, not the whole library.
 */
export const usedSampleIds = (project: Project): string[] => {
  const found = new Set<string>()
  const fromPatch = (patch: Patch) => {
    for (const node of patch.nodes) if (node.sampleId !== undefined) found.add(node.sampleId)
  }
  fromPatch(project.master.fx)
  for (const module of project.modules) fromPatch(module.patch)
  for (const track of project.tracks) {
    fromPatch(track.fx)
    if (track.kind === 'instrument') fromPatch(track.patch)
    if (track.kind === 'audio') for (const clip of track.clips) if (clip) found.add(clip.sampleId)
  }
  return [...found]
}
