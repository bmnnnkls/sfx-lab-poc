import type { ControlDomain, ControlOwner, ControlTarget, ControlValue } from '../control'
import type { ModuleDefinition, Patch } from '../patch'

export interface SnapshotScope { readonly owner: ControlOwner; readonly domain: ControlDomain | 'track' }
export interface Snapshot { readonly id: string; readonly name: string; readonly scope: SnapshotScope; readonly values: readonly ControlValue[] }
export type SampleTarget = Omit<Extract<ControlTarget, { kind: 'graph' }>, 'paramId'>
/** null is an explicit silent instance; absent bindings inherit the shared node default. */
export interface SampleBinding { readonly target: SampleTarget; readonly sampleId: string | null }
/** Storage-independent immutable payloads. No clips, mixer routing or hardware assignments. */
export type AssetPayload =
  | { readonly kind: 'instrument'; readonly patch: Patch; readonly noteGraph: Patch; readonly voices: number; readonly modules: readonly ModuleDefinition[]; readonly sampleIds: readonly string[] }
  | { readonly kind: 'audio-effect' | 'note-effect'; readonly graph: Patch; readonly modules: readonly ModuleDefinition[]; readonly sampleIds: readonly string[] }
export interface AssetRevision { readonly id: string; readonly signature: string; readonly payload: AssetPayload }
export interface ProjectPreset extends Snapshot { readonly revisionId: string; readonly samples: readonly SampleBinding[] }
export interface RecallIssue { readonly target: ControlTarget | SampleTarget; readonly status: 'missing' | 'incompatible'; readonly reason: string }
