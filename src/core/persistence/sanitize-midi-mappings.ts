import { type MidiMapping, isLearnableCC, midiSourceKey } from '../midi'
import type { ControlTarget } from '../control'
import { sanitizeControlValues } from './sanitize-control-values'
import { isRecord, type Warn } from './raw'
const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 256
const targetOf = (raw: unknown): ControlTarget | undefined => {
  if (!isRecord(raw)) return undefined
  if (raw.kind === 'graph') return sanitizeControlValues([{ target: raw, value: 0 }], () => {})?.[0]?.target
  const owner = isRecord(raw.owner) && raw.owner.kind === 'master' ? { kind: 'master' as const }
    : isRecord(raw.owner) && raw.owner.kind === 'track' && id(raw.owner.trackId) ? { kind: 'track' as const, trackId: raw.owner.trackId } : undefined
  if (!owner || raw.kind !== 'mixer') return undefined
  if (raw.control === 'volume' || raw.control === 'pan') return { kind: 'mixer', owner, control: raw.control }
  if (raw.control === 'send' && id(raw.returnId)) return { kind: 'mixer', owner, control: 'send', returnId: raw.returnId }
  return undefined
}
export const sanitizeMidiMappings = (raw: unknown, warn: Warn): readonly MidiMapping[] | undefined => {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw)) { warn('Invalid MIDI mappings'); return undefined }
  if (raw.length > 1024) warn('Only the first 1024 MIDI mappings were kept')
  const ids = new Set<string>(), sources = new Set<string>(), result: MidiMapping[] = []
  for (const entry of raw.slice(0, 1024)) {
    const target = isRecord(entry) ? targetOf(entry.target) : undefined
    if (!isRecord(entry) || !id(entry.id) || !id(entry.deviceId) || typeof entry.deviceName !== 'string' || entry.deviceName.length > 256 || !Number.isInteger(entry.channel) || (entry.channel as number) < 0 || (entry.channel as number) > 15 || !isLearnableCC(entry.cc as number) || typeof entry.pickup !== 'boolean' || !target) { warn('Invalid MIDI mapping skipped'); continue }
    const mapping: MidiMapping = { id: entry.id, deviceId: entry.deviceId, deviceName: entry.deviceName, channel: entry.channel as number, cc: entry.cc as number, pickup: entry.pickup, target }
    const source = midiSourceKey(mapping)
    if (ids.has(mapping.id) || sources.has(source)) { warn('Duplicate MIDI mapping skipped'); continue }
    ids.add(mapping.id); sources.add(source); result.push(mapping)
  }
  return result.length ? result : undefined
}
