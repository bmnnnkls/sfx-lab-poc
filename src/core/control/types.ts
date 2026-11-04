import type { ParamSpec } from '../dsp'

/** Whose controls: a track's (returns use their track ids), a group bus's (by group id) or the master's. */
export type ControlOwner = { readonly kind: 'track'; readonly trackId: string } | { readonly kind: 'group'; readonly groupId: string } | { readonly kind: 'master' }

/** The id an owner has in the engine's track map and in the project: a track's or a group's; null for the master. */
export const controlOwnerId = (owner: ControlOwner): string | null => (owner.kind === 'track' ? owner.trackId : owner.kind === 'group' ? owner.groupId : null)
export type ControlDomain = 'patch' | 'notes' | 'fx'
/** Module identity is checked as well as use identity: replacing a use must not redirect a target. */
export interface InstanceStep { readonly nodeId: string; readonly moduleId: string }
export type ControlTarget =
  | { readonly kind: 'graph'; readonly owner: ControlOwner; readonly domain: ControlDomain; readonly path: readonly InstanceStep[]; readonly nodeId: string; readonly nodeType: string; readonly paramId: string }
  | { readonly kind: 'mixer'; readonly owner: ControlOwner; readonly control: 'volume' }
  | { readonly kind: 'mixer'; readonly owner: ControlOwner; readonly control: 'pan' }
  | { readonly kind: 'mixer'; readonly owner: ControlOwner; readonly control: 'send'; readonly returnId: string }

export interface ControlValue { readonly target: ControlTarget; readonly value: number }
export type ControlResolution =
  | { readonly status: 'available'; readonly spec: ParamSpec; readonly baseValue: number; readonly automatable: boolean; readonly interpolation: 'linear' | 'hold'; readonly reason?: string }
  | { readonly status: 'missing' | 'incompatible'; readonly reason: string }

/** Canonical structured identity; labels, positions and object property insertion order have no role. */
export const controlTargetKey = (target: ControlTarget): string => JSON.stringify([
  target.owner.kind, controlOwnerId(target.owner),
  target.kind, ...(target.kind === 'graph'
    ? [target.domain, target.path.map((step) => [step.nodeId, step.moduleId]), target.nodeId, target.nodeType, target.paramId]
    : [target.control, target.control === 'send' ? target.returnId : null]),
])
