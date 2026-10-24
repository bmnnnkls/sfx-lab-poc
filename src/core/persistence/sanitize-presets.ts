import { assetSignature, sampleTargetKey, type Snapshot, type SnapshotScope, type SampleBinding, type AssetRevision, type AssetPayload, type ProjectPreset } from '../preset'
import { type ControlValue, controlTargetKey } from '../control'
import { targetOf } from './sanitize-midi-mappings'
import { asList, isRecord, nonEmptyText, type Warn } from './raw'
import { sanitizeModules } from './sanitize-modules'
import { sanitizePatch } from './sanitize-patch'
const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 256
const bounded = (raw: unknown, limit: number, warn: Warn): unknown[] => {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) { warn('Invalid preset/snapshot list'); return [] }
  if (raw.length > limit) warn(`Preset/snapshot list limited to ${limit}`)
  return raw.slice(0, limit)
}
const scopeOf = (raw: unknown): SnapshotScope | undefined => {
  if (!isRecord(raw) || !['track', 'patch', 'notes', 'fx'].includes(raw.domain as string)) return undefined
  const target = targetOf({ kind: 'mixer', control: 'volume', owner: raw.owner })
  return target ? { owner: target.owner, domain: raw.domain as SnapshotScope['domain'] } : undefined
}
const valuesOf = (raw: unknown, warn: Warn): ControlValue[] => {
  const result = new Map<string, ControlValue>()
  for (const entry of bounded(raw, 4096, warn)) {
    const target = isRecord(entry) && targetOf(entry.target)
    if (!target || !isRecord(entry) || typeof entry.value !== 'number' || !Number.isFinite(entry.value)) { warn('Invalid snapshot value skipped'); continue }
    result.set(controlTargetKey(target), { target, value: entry.value })
  }
  return [...result.values()]
}
export const sanitizeSampleBindings = (raw: unknown, warn: Warn): SampleBinding[] => {
  const result = new Map<string, SampleBinding>()
  for (const entry of bounded(raw, 4096, warn)) {
    const target = isRecord(entry) && isRecord(entry.target) ? targetOf({ ...entry.target, paramId: 'sample' }) : undefined
    if (target?.kind !== 'graph' || !isRecord(entry) || !(entry.sampleId === null || id(entry.sampleId))) { warn('Invalid sample binding skipped'); continue }
    const { paramId: _unused, ...sampleTarget } = target
    result.set(sampleTargetKey(sampleTarget), { target: sampleTarget, sampleId: entry.sampleId })
  }
  return [...result.values()]
}
export const sanitizePresetFields = (raw: Record<string, unknown>, sampleIds: ReadonlySet<string>, warn: Warn) => {
  const readSnapshots = (input: unknown): Snapshot[] => {
    const seen = new Set<string>()
    return bounded(input, 128, warn).flatMap(entry => {
      const scope = isRecord(entry) ? scopeOf(entry.scope) : undefined
      if (!isRecord(entry) || !id(entry.id) || seen.has(entry.id) || !scope) { warn('Invalid snapshot skipped'); return [] }
      seen.add(entry.id)
      return [{ id: entry.id, name: nonEmptyText(entry.name, 'Snapshot', 80), scope, values: valuesOf(entry.values, warn) }]
    })
  }
  const snapshots = readSnapshots(raw.snapshots), sampleBindings = sanitizeSampleBindings(raw.sampleBindings, warn)
  const assetRevisions: AssetRevision[] = [], seen = new Set<string>()
  for (const entry of bounded(raw.assetRevisions, 64, warn)) {
    if (!isRecord(entry) || !id(entry.id) || seen.has(entry.id) || !isRecord(entry.payload) || !['instrument', 'audio-effect', 'note-effect'].includes(entry.payload.kind as string)) { warn('Invalid asset revision skipped'); continue }
    const p = entry.payload, modules = sanitizeModules(p.modules, sampleIds, warn)
    const deps = asList(p.sampleIds).slice(0, 256).filter(id)
    let payload: AssetPayload
    if (p.kind === 'instrument') payload = { kind: 'instrument', patch: sanitizePatch(p.patch, 'Preset instrument', sampleIds, modules, warn), noteGraph: sanitizePatch(p.noteGraph, 'Preset notes', sampleIds, modules, warn, 'notes'), voices: Math.min(16, Math.max(1, Math.round(typeof p.voices === 'number' && Number.isFinite(p.voices) ? p.voices : 8))), modules, sampleIds: deps }
    else payload = { kind: p.kind as 'audio-effect' | 'note-effect', graph: sanitizePatch(p.graph, 'Preset graph', sampleIds, modules, warn, p.kind === 'note-effect' ? 'notes' : 'audio'), modules, sampleIds: deps }
    seen.add(entry.id)
    assetRevisions.push({ id: entry.id, signature: assetSignature(payload), payload })
  }
  const presets: ProjectPreset[] = []
  for (const snapshot of readSnapshots(raw.presets)) {
    const entry = asList(raw.presets).slice(0, 128).find(e => isRecord(e) && e.id === snapshot.id)
    if (!isRecord(entry) || !id(entry.revisionId)) { warn('Invalid preset revision reference'); continue }
    presets.push({ ...snapshot, revisionId: entry.revisionId, samples: sanitizeSampleBindings(entry.samples, warn) })
  }
  return { ...(snapshots.length && { snapshots }), ...(sampleBindings.length && { sampleBindings }), ...(assetRevisions.length && { assetRevisions }), ...(presets.length && { presets }) }
}
