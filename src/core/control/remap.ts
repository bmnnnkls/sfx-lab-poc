import type { Project } from '../project'
import { resolveControlTarget } from './resolve'
import { controlTargetKey, type ControlTarget, type ControlValue } from './types'

/** Explicit route changes support grouping/unlinking (complete route replacement) and duplication/insertion (ID maps). */
export interface ControlRemap {
  readonly owners?: Readonly<Record<string, string | null>>
  readonly returns?: Readonly<Record<string, string | null>>
  readonly nodes?: Readonly<Record<string, string | null>>
  readonly modules?: Readonly<Record<string, string | null>>
  readonly routes?: readonly { readonly from: ControlTarget; readonly to: ControlTarget | null }[]
}
export const remapControlTarget = (target: ControlTarget, remap: ControlRemap, destination: Project): { readonly status: 'mapped'; readonly target: ControlTarget } | { readonly status: 'missing' | 'incompatible'; readonly reason: string } => {
  const route = remap.routes?.find((route) => controlTargetKey(route.from) === controlTargetKey(target))
  if (route) {
    if (route.to === null) return { status: 'missing', reason: 'Target removed by graph transformation' }
    const result = resolveControlTarget(destination, route.to)
    return result.status === 'available' ? { status: 'mapped', target: route.to } : result
  }
  const map = (id: string, ids?: Readonly<Record<string, string | null>>) => ids && Object.hasOwn(ids, id) ? ids[id] : id
  const owner = target.owner
  const ownerId = owner.kind === 'track' ? map(owner.trackId, remap.owners) : owner.kind === 'group' ? map(owner.groupId, remap.owners) : undefined
  if (ownerId === null) return { status: 'missing', reason: 'Owner removed' }
  let mapped: ControlTarget = { ...target, owner: owner.kind === 'track' ? { kind: 'track', trackId: ownerId as string } : owner.kind === 'group' ? { kind: 'group', groupId: ownerId as string } : owner }
  if (mapped.kind === 'graph') {
    const nodeId = map(mapped.nodeId, remap.nodes)
    const path = mapped.path.map((step) => ({ nodeId: map(step.nodeId, remap.nodes), moduleId: map(step.moduleId, remap.modules) }))
    if (!nodeId || path.some((step) => !step.nodeId || !step.moduleId)) return { status: 'missing', reason: 'Node or module removed' }
    mapped = { ...mapped, nodeId, path: path as Extract<ControlTarget, { kind: 'graph' }>['path'] }
  } else if (mapped.kind === 'mixer' && mapped.control === 'send') {
    const returnId = map(mapped.returnId, remap.returns ?? remap.owners)
    if (!returnId) return { status: 'missing', reason: 'Return removed' }
    mapped = { ...mapped, returnId }
  }
  const resolved = resolveControlTarget(destination, mapped)
  return resolved.status === 'available' ? { status: 'mapped', target: mapped } : resolved
}

/** Partial remaps carry explicit diagnostics; no missing target is substituted or silently discarded. */
export const remapControlValues = (values: readonly ControlValue[], remap: ControlRemap, destination: Project) => {
  const mapped: ControlValue[] = []
  const unavailable: { readonly target: ControlTarget; readonly status: 'missing' | 'incompatible'; readonly reason: string }[] = []
  for (const entry of values) {
    const result = remapControlTarget(entry.target, remap, destination)
    if (result.status === 'mapped') mapped.push({ ...entry, target: result.target })
    else unavailable.push({ target: entry.target, ...result })
  }
  return { values: mapped, unavailable }
}
