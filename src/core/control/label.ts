import type { Project } from '../project'
import { controlGraph } from './resolve'
import type { ControlTarget } from './types'
export const controlTargetLabel = (project: Project, target: ControlTarget): string => {
  if (target.kind === 'mixer') return `Mixer / ${target.control}${target.control === 'send' ? ` / ${project.tracks.find((t) => t.id === target.returnId)?.name ?? target.returnId}` : ''}`
  let patch = controlGraph(project, target.owner, target.domain)
  const names: string[] = [target.domain === 'patch' ? 'Instrument' : target.domain === 'notes' ? 'Notes' : 'Effects']
  for (const step of target.path) {
    names.push(patch?.nodes.find((n) => n.id === step.nodeId)?.name ?? step.nodeId)
    patch = project.modules.find((m) => m.id === step.moduleId)?.patch
  }
  const node = patch?.nodes.find((n) => n.id === target.nodeId)
  names.push(node?.name ?? target.nodeType, target.paramId)
  return names.join(' / ')
}
