import { setNodeParam } from '../patch'
import { type Project, editPatchAt, setMasterVolume, setTrackPan, setTrackSend, setTrackVolume } from '../project'
import { resolveControlTarget } from './resolve'
import { type ControlTarget, type ControlValue, controlTargetKey } from './types'
import { clampControlValue } from './values'

export type ControlEditResult = { readonly status: 'applied'; readonly project: Project } | { readonly status: 'missing' | 'incompatible'; readonly project: Project; readonly reason: string }
/** Base edits are pure; module definitions are never changed by an instance target. */
export const editControlBase = (project: Project, target: ControlTarget, value: number): ControlEditResult => {
  const resolved = resolveControlTarget(project, target)
  if (resolved.status !== 'available') return { ...resolved, project }
  if (!Number.isFinite(value)) return { status: 'incompatible', project, reason: 'Value must be finite' }
  const next = clampControlValue(resolved.spec, value)
  if (next === resolved.baseValue) return { status: 'applied', project }
  if (target.kind === 'mixer') {
    const owner = target.owner
    const edited = owner.kind === 'master' ? setMasterVolume(project, next)
      : target.control === 'volume' ? setTrackVolume(project, owner.trackId, next)
      : target.control === 'pan' ? setTrackPan(project, owner.trackId, next)
      : setTrackSend(project, owner.trackId, target.returnId, next)
    return { status: 'applied', project: edited }
  }
  if (target.path.length === 0) {
    const at = target.owner.kind === 'master' ? { master: true as const } : { trackId: target.owner.trackId, graph: target.domain }
    const entries = project.controlValues?.filter((entry) => controlTargetKey(entry.target) !== controlTargetKey(target))
    const { controlValues: _saved, ...withoutValues } = project
    const clean = entries?.length === project.controlValues?.length ? project
      : entries?.length ? { ...project, controlValues: entries } : withoutValues
    return { status: 'applied', project: editPatchAt(clean, at, (patch) => setNodeParam(patch, target.nodeId, target.paramId, next)) }
  }
  const key = controlTargetKey(target)
  return { status: 'applied', project: { ...project, controlValues: [...(project.controlValues ?? []).filter((entry) => controlTargetKey(entry.target) !== key), { target, value: next }] } }
}

export const editControlBases = (project: Project, changes: readonly ControlValue[]): Project =>
  changes.reduce((next, change) => editControlBase(next, change.target, change.value).project, project)
