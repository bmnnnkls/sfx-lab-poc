import { controlParamKey, moduleControls } from '../patch'
import type { Project } from '../project'
import { controlGraph } from './resolve'
import type { ControlDomain, ControlOwner, ControlTarget, InstanceStep } from './types'

/** Convert an editor parameter (including chains of exposed module knobs) to its canonical leaf target. */
export const controlTargetForGraphParam = (project: Project, owner: ControlOwner, domain: ControlDomain, nodeId: string, paramId: string): ControlTarget | undefined => {
  let patch = controlGraph(project, owner, domain)
  const path: InstanceStep[] = []
  for (let depth = 0; patch && depth <= 32; depth++) {
    const node = patch.nodes.find((node) => node.id === nodeId)
    if (!node) return undefined
    if (node.type !== 'module') return { kind: 'graph', owner, domain, path, nodeId, nodeType: node.type, paramId }
    const definition = project.modules.find((module) => module.id === node.moduleId)
    if (!definition) return undefined
    const knob = definition.knobs.find((knob) => knob.id === paramId)
    const control = moduleControls(definition).flatMap(({ node, params }) => params.map((param) => ({ node: node.id, param, id: controlParamKey(node.id, param) }))).find((control) => control.id === paramId)
    const inner = knob ?? control
    if (!inner) return undefined
    path.push({ nodeId, moduleId: definition.id })
    nodeId = inner.node
    paramId = inner.param
    patch = definition.patch
  }
  return undefined
}
