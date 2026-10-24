import { LIBRARY_BUNDLE_VERSION, LIBRARY_CATALOG_VERSION, canonicalRecord, selectLibraryBundle, validateLibraryCatalog, upgradeLibraryCatalog, validateBundleObjectBudget, libraryName, mergeLibraryBundle, type LibraryBundleManifest, type LibraryBundleSelection, type LibraryBundleStage, type LibraryCatalog } from '@core'
import { strFromU8, strToU8, zipSync } from 'fflate'
import { sha256Hex } from './hash'
import { fileStem } from './project-transfer'
import { LIBRARY_ARCHIVE_LIMITS, readLibraryArchive } from './library-archive'
import type { LibraryStorage } from './library-storage'

/** Independent from project migrations. Add explicit vN→vN+1 steps here when the bundle format changes. */
const migrateLibraryManifest = (raw: unknown): LibraryBundleManifest => {
  validateBundleObjectBudget(raw)
  if (!raw || typeof raw !== 'object' || !('format' in raw) || raw.format !== 'sfx-lab-library' || !('version' in raw) || (raw.version !== LIBRARY_BUNDLE_VERSION && raw.version !== 1)) throw new Error('Unsupported library bundle format/version. Update SFX Lab to import this bundle.')
  const m = raw as LibraryBundleManifest
  const rawManifest = raw as Record<string, unknown>, manifestVersion = rawManifest.version, rawCatalog = rawManifest.catalog
  if (Object.keys(m).some(k => !['format', 'version', 'name', 'partial', 'missing', 'catalog'].includes(k)) || typeof m.name !== 'string' || libraryName(m.name) !== m.name || typeof m.partial !== 'boolean' || !Array.isArray(m.missing) || m.missing.length > 4096 || m.missing.some(id => typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) || new Set(m.missing).size !== m.missing.length || m.partial !== (m.missing.length > 0)) throw new Error('Invalid library bundle manifest/completeness marker')
  const catalogVersion = rawCatalog && typeof rawCatalog === 'object' && 'version' in rawCatalog ? rawCatalog.version : undefined
  if (manifestVersion === 1 && catalogVersion !== 1 || manifestVersion === LIBRARY_BUNDLE_VERSION && catalogVersion !== LIBRARY_CATALOG_VERSION) throw new Error('Library bundle and catalog versions do not match')
  const catalog = manifestVersion === 1 ? validateLibraryCatalog(upgradeLibraryCatalog(rawCatalog)) : validateLibraryCatalog(rawCatalog)
  return { ...m, version: LIBRARY_BUNDLE_VERSION, catalog }
}

export const exportLibraryBundle = async (catalog: LibraryCatalog, selection: LibraryBundleSelection, name: string, readSample: (id: string) => Promise<Uint8Array | undefined>, allowPartial = false) => {
  const selected = selectLibraryBundle(catalog, selection), missing: string[] = [], files: Record<string, [Uint8Array, { level: 0; mtime: Date }]> = {}
  let expanded = 0
  for (const sample of selected.samples) {
    const data = await readSample(sample.id)
    if (!data) { missing.push(sample.id); continue }
    if (data.length !== sample.bytes || await sha256Hex(data) !== sample.id) throw new Error(`Sample bytes/hash do not match metadata: ${sample.name}`)
    if (data.length > LIBRARY_ARCHIVE_LIMITS.entry || (expanded += data.length) > LIBRARY_ARCHIVE_LIMITS.expanded) throw new Error('Library bundle byte limit exceeded')
    files[`samples/${sample.id}`] = [data, { level: 0, mtime: new Date(2000, 0, 1) }]
  }
  const manifest: LibraryBundleManifest = { format: 'sfx-lab-library', version: LIBRARY_BUNDLE_VERSION, name: libraryName(name), partial: missing.length > 0, missing, catalog: selected }
  if (missing.length && !allowPartial) throw new Error(`Bundle incomplete: ${missing.length} sample byte file(s) missing. Restore bytes or explicitly allow a partial export.`)
  const json = strToU8(canonicalRecord(manifest))
  if (json.length > LIBRARY_ARCHIVE_LIMITS.manifest || expanded + json.length > LIBRARY_ARCHIVE_LIMITS.expanded || Object.keys(files).length + 1 > LIBRARY_ARCHIVE_LIMITS.entries) throw new Error('Library bundle resource limit exceeded')
  const bytes = zipSync({ 'manifest.json': [json, { level: 0, mtime: new Date(2000, 0, 1) }], ...files })
  if (bytes.length > LIBRARY_ARCHIVE_LIMITS.compressed) throw new Error('Library bundle compressed byte limit exceeded')
  return { fileName: `${fileStem(name)}${manifest.partial ? '-partial' : ''}.sfxlib`, mimeType: 'application/zip', bytes, manifest }
}

/** Pure staging: no storage writes, audio decoding or live-engine work. */
export const stageLibraryBundle = async (bytes: Uint8Array): Promise<LibraryBundleStage> => {
  const entries = readLibraryArchive(bytes), manifest = migrateLibraryManifest(JSON.parse(strFromU8(entries.get('manifest.json')!)))
  const blobs = new Map<string, Uint8Array>(), missing: string[] = []
  const allowed = new Set(['manifest.json', ...manifest.catalog.samples.map(s => `samples/${s.id}`)])
  for (const path of entries.keys()) if (!allowed.has(path)) throw new Error('Unreferenced library archive entry')
  for (const sample of manifest.catalog.samples) {
    const data = entries.get(`samples/${sample.id}`)
    if (!data) { missing.push(sample.id); continue }
    if (data.length !== sample.bytes || await sha256Hex(data) !== sample.id) throw new Error(`Library sample hash/size mismatch: ${sample.name}`)
    blobs.set(sample.id, data)
  }
  if (canonicalRecord([...missing].sort()) !== canonicalRecord([...manifest.missing].sort())) throw new Error('Bundle missing bytes do not match the explicit manifest marker')
  return { manifest, blobs, missing, expandedBytes: [...entries.values()].reduce((n, b) => n + b.length, 0) }
}

/** Revalidate staged data at the trust boundary. Latest-catalog remapping occurs inside the atomic write. */
export const commitLibraryBundle = async (storage: LibraryStorage, stage: LibraryBundleStage): Promise<LibraryCatalog> => {
  const manifest = migrateLibraryManifest(structuredClone(stage.manifest))
  if (manifest.partial || stage.missing.length) throw new Error('Incomplete library bundle: restore missing bytes and export a complete bundle before importing')
  const blobs = new Map<string, Uint8Array>()
  for (const sample of manifest.catalog.samples) {
    const data = stage.blobs.get(sample.id)?.slice()
    if (!data || data.length !== sample.bytes || await sha256Hex(data) !== sample.id) throw new Error('Staged library sample hash/size mismatch')
    blobs.set(sample.id, data)
  }
  return storage.update(current => mergeLibraryBundle(current, manifest.catalog, manifest.name), blobs)
}
export { LIBRARY_ARCHIVE_LIMITS } from './library-archive'
