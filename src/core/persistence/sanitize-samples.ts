import type { SampleInfo } from '../sample'
import { clamp } from '../shared'
import { LIMITS } from './format'
import { type Warn, asList, finiteNumber, isRecord, nonEmptyText } from './raw'

const SAMPLE_ID = /^[0-9a-f]{64}$/
const EXTENSION = /^[a-z0-9]{1,5}$/

/** Sample ids are SHA-256 hashes; anything else cannot match stored audio and is dropped. */
export const sanitizeSamples = (raw: unknown, warn: Warn): SampleInfo[] => {
  const list = asList(raw)
  if (list.length > LIMITS.samples) warn(`Only the first ${LIMITS.samples} samples were kept`)

  const seen = new Set<string>()
  const samples: SampleInfo[] = []
  let skipped = 0

  for (const entry of list.slice(0, LIMITS.samples)) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !SAMPLE_ID.test(entry.id) || seen.has(entry.id)) {
      skipped++
      continue
    }
    seen.add(entry.id)
    const extension = typeof entry.extension === 'string' ? entry.extension.toLowerCase() : ''
    samples.push({
      id: entry.id,
      name: nonEmptyText(entry.name, 'Sample', 60),
      extension: EXTENSION.test(extension) ? extension : 'bin',
      durationSeconds: Math.max(0, finiteNumber(entry.durationSeconds, 0)),
      sampleRate: clamp(finiteNumber(entry.sampleRate, 44100), 8000, 192000),
      channels: Math.round(clamp(finiteNumber(entry.channels, 1), 1, 8)),
      bytes: Math.max(0, finiteNumber(entry.bytes, 0)),
    })
  }
  if (skipped > 0) warn(`Skipped ${skipped} invalid sample entr${skipped === 1 ? 'y' : 'ies'}`)
  return samples
}
