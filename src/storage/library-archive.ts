import { Inflate } from 'fflate'

export const LIBRARY_ARCHIVE_LIMITS = {
  compressed: 128 * 1024 * 1024,
  expanded: 256 * 1024 * 1024,
  /** One sample: 64 MiB, the project package's cap, so a 120 s stereo float WAV (46 MB) fits. */
  entry: 64 * 1024 * 1024,
  manifest: 8 * 1024 * 1024,
  entries: 4097,
} as const
const invalid = (reason: string): never => { throw new Error(`Invalid library archive: ${reason}`) }
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => { for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0 })
const crc32 = (bytes: Uint8Array): number => { let n = 0xffffffff; for (const b of bytes) n = crcTable[(n ^ b) & 255]! ^ (n >>> 8); return (n ^ 0xffffffff) >>> 0 }

/** Strict single-disk ZIP subset. Inspect *all* central/local headers before allocating any output.
 * Reject descriptors, ZIP64, encryption, extras, comments, gaps, aliases and unknown paths.
 * Do not trust originalSize to bound inflate: stream 1 KiB compressed chunks with actual-output checks.
 * fflate Inflate retains a 32 KiB dictionary; one chunk's expansion is bounded by DEFLATE's ~1032x ratio.
 */
export const readLibraryArchive = (bytes: Uint8Array): Map<string, Uint8Array> => {
  const limit = LIBRARY_ARCHIVE_LIMITS
  if (bytes.length > limit.compressed) invalid('compressed byte limit')
  if (bytes.length < 22) invalid('truncated ZIP')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const u16 = (at: number) => { if (at < 0 || at + 2 > bytes.length) return invalid('truncated header'); return view.getUint16(at, true) }
  const u32 = (at: number) => { if (at < 0 || at + 4 > bytes.length) return invalid('truncated header'); return view.getUint32(at, true) }
  const end = bytes.length - 22
  if (u32(end) !== 0x06054b50 || u16(end + 4) || u16(end + 6) || u16(end + 20)) invalid('unsupported ZIP footer')
  const count = u16(end + 10), directory = u32(end + 16), directorySize = u32(end + 12)
  if (!count || count > limit.entries || u16(end + 8) !== count) invalid('entry count limit or multi-disk ZIP')
  if (directory + directorySize !== end) invalid('directory bounds')
  const entries: { name: string; start: number; compressed: number; expanded: number; method: number; crc: number }[] = []
  const names = new Set<string>(); let cursor = directory, local = 0, total = 0
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || u32(cursor) !== 0x02014b50) invalid('central header')
    const flags = u16(cursor + 8), method = u16(cursor + 10), crc = u32(cursor + 16), compressed = u32(cursor + 20), expanded = u32(cursor + 24), length = u16(cursor + 28), offset = u32(cursor + 42)
    if (flags & ~0x800 || ![0, 8].includes(method) || u16(cursor + 30) || u16(cursor + 32) || u16(cursor + 34) || (u32(cursor + 38) >>> 16 & 0xf000) === 0xa000) invalid('unsupported ZIP features')
    if (length > 100 || cursor + 46 + length > end) invalid('path limit')
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + length)
    if (nameBytes.some(b => b < 32 || b > 126)) invalid('non-ASCII archive path')
    const name = new TextDecoder().decode(nameBytes)
    if (!(name === 'manifest.json' || /^samples\/[a-f0-9]{64}$/.test(name)) || names.has(name)) invalid('unsafe, duplicate or unknown path')
    names.add(name)
    if (expanded > (name === 'manifest.json' ? limit.manifest : limit.entry) || compressed > limit.compressed || (total += expanded) > limit.expanded) invalid('expanded byte limit')
    if (offset !== local || local + 30 > directory || u32(local) !== 0x04034b50) invalid('overlapping or noncontiguous entries')
    if (u16(local + 6) !== flags || u16(local + 8) !== method || u32(local + 14) !== crc || u32(local + 18) !== compressed || u32(local + 22) !== expanded || u16(local + 26) !== length || u16(local + 28)) invalid('local/central header mismatch')
    const start = local + 30 + length
    if (start + compressed > directory || bytes.subarray(local + 30, start).some((b, j) => b !== nameBytes[j])) invalid('entry bounds or name mismatch')
    if (method === 0 && compressed !== expanded) invalid('stored entry size mismatch')
    entries.push({ name, start, compressed, expanded, method, crc })
    local = start + compressed; cursor += 46 + length
  }
  if (cursor !== end || local !== directory || !names.has('manifest.json')) invalid('directory/manifest mismatch')
  const output = new Map<string, Uint8Array>()
  for (const entry of entries) {
    const data = bytes.subarray(entry.start, entry.start + entry.compressed)
    let result: Uint8Array
    if (entry.method === 0) result = data.slice()
    else {
      // Allocation is now bounded by the validated per-entry and aggregate declarations.
      result = new Uint8Array(entry.expanded)
      let written = 0
      const inflater = new Inflate((chunk) => {
        if (written + chunk.length > entry.expanded) invalid('actual expanded size exceeds declaration')
        result.set(chunk, written); written += chunk.length
      })
      if (!data.length) invalid('empty deflate stream')
      for (let at = 0; at < data.length; at += 1024) inflater.push(data.subarray(at, at + 1024), at + 1024 >= data.length)
      if (written !== entry.expanded) invalid('actual expanded size differs from declaration')
    }
    if (crc32(result) !== entry.crc) invalid('CRC mismatch')
    output.set(entry.name, result)
  }
  return output
}
