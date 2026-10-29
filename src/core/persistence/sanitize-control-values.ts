import { type ControlOwner, type ControlTarget, type ControlValue, controlTargetKey } from '../control'
import { type Warn, isRecord } from './raw'
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256
/** A control owner from untrusted data: the master, a track by id or a group by id. */
export const readControlOwner = (raw: unknown): ControlOwner | undefined =>
  !isRecord(raw) ? undefined
    : raw.kind === 'master' ? { kind: 'master' }
    : raw.kind === 'track' && id(raw.trackId) ? { kind: 'track', trackId: raw.trackId }
    : raw.kind === 'group' && id(raw.groupId) ? { kind: 'group', groupId: raw.groupId }
    : undefined
/** Bounded structural validation retains unavailable references so a later graph edit cannot retarget them. */
export const sanitizeControlValues = (raw: unknown, warn: Warn): readonly ControlValue[] | undefined => {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw)) { warn('Invalid control values'); return undefined }
  if (raw.length > 4096) warn('Only the first 4096 control values were kept')
  const entries = new Map<string, ControlValue>()
  for (const entry of raw.slice(0, 4096)) {
    if (!isRecord(entry) || !Number.isFinite(entry.value) || !isRecord(entry.target)) { warn('Invalid control value skipped'); continue }
    const t = entry.target
    const owner = readControlOwner(t.owner)
    // Saved overrides are needed only for graph instances. Mixer/base node values live in existing fields.
    if (!owner || t.kind !== 'graph' || !['patch', 'notes', 'fx'].includes(t.domain as string) || !id(t.nodeId) || !id(t.nodeType) || !id(t.paramId) || !Array.isArray(t.path) || t.path.length > 32 || !t.path.every((step) => isRecord(step) && id(step.nodeId) && id(step.moduleId))) {
      warn('Invalid control target skipped'); continue
    }
    const target: ControlTarget = { kind: 'graph', owner, domain: t.domain as 'patch' | 'notes' | 'fx', nodeId: t.nodeId, nodeType: t.nodeType, paramId: t.paramId, path: t.path.map((step) => ({ nodeId: step.nodeId as string, moduleId: step.moduleId as string })) }
    entries.set(controlTargetKey(target), { target, value: entry.value as number })
  }
  return entries.size ? [...entries.values()] : undefined
}
