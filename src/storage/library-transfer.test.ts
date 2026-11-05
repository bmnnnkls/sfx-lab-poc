import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { zipSync, strToU8 } from 'fflate'
import { copyLibraryEntries, loadFactoryModule, noteGraphFrom, createSamplerPatch, createModuleUse, enumerateSampleTargets, editSampleBinding, type ModuleDefinition, captureLibraryAsset, captureLibraryClip, captureLibrarySample, createEmptyProject, createAudioTrack, createAudioClip, createClip, createNote, emptyLibrary, saveLibraryFolder, mergeLibraryBundle, validateLibraryCatalog, saveProjectPreset, insertLibraryAsset, insertLibraryClip, parseProject, serializeProject, recallProjectPreset, trashLibraryEntry, type Project, type LibraryCatalog, type LibraryBundleManifest, type InstrumentTrack } from '@core'
import { createMemoryLibraryStorage, createLibraryStorage } from './library-storage'
import { createMemorySampleStorage, createIndexedDbSampleStorage } from './sample-storage'
import { exportLibraryBundle, stageLibraryBundle, commitLibraryBundle, LIBRARY_ARCHIVE_LIMITS } from './library-transfer'
import { exportProject, importProject } from './project-transfer'
import { sha256Hex } from './hash'
const database = () => `bundle-${crypto.randomUUID()}`
const archive = (manifest: unknown, files: Record<string, Uint8Array> = {}) => zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)), ...files })
const fixture = async () => {
  const blobs = new Map<string, Uint8Array>()
  let json = readFileSync(new URL('../core/persistence/fixtures/v6-presets.sfxlab.json', import.meta.url), 'utf8')
  const old = JSON.parse(json).project.samples as { id: string; bytes: number }[]
  for (const [index, s] of old.entries()) {
    const bytes = Uint8Array.of(index, 1, 2, 3), hash = await sha256Hex(bytes)
    json = json.replaceAll(s.id, hash); blobs.set(hash, bytes)
  }
  const loaded = parseProject(json); if (!loaded.ok) throw new Error(loaded.error)
  let p: Project = { ...loaded.project, samples: loaded.project.samples.map(s => ({ ...s, bytes: blobs.get(s.id)!.length })) }
  const scope = { owner: { kind: 'track' as const, trackId: p.tracks[0]!.id }, domain: 'patch' as const }
  p = saveProjectPreset(p, scope, 'Second instrument sound')
  const fx = { ...scope, domain: 'fx' as const }
  p = saveProjectPreset(saveProjectPreset(p, fx, 'Dry'), fx, 'Second effect sound')
  const midi = createClip('MIDI', 4, [createNote(60, 0, 1)]), audio = createAudioClip(p.samples[0]!, 120), at = createAudioTrack('Audio', p.sceneCount)
  p = { ...p, tracks: [{ ...p.tracks[0] as InstrumentTrack, clips: [midi, ...(p.tracks[0] as InstrumentTrack).clips.slice(1)] }, { ...at, clips: [audio, ...at.clips.slice(1)] }] }
  let c = saveLibraryFolder(saveLibraryFolder(emptyLibrary(), 'Collection', null, 'collection'), 'Nested', 'collection', 'nested')
  c = captureLibraryAsset(c, p, scope, 'Instrument', 'nested')
  c = captureLibraryAsset(c, p, fx, 'Effect', 'collection')
  c = captureLibraryClip(c, p, scope.owner.trackId, midi.id, 'MIDI', 'collection')
  c = captureLibraryClip(c, p, at.id, audio.id, 'Audio', 'nested')
  c = captureLibrarySample(c, p, p.samples[0]!.id, 'Sample', 'nested')
  return { c, blobs, read: async (id: string) => blobs.get(id) }
}

describe('library bundle exchange', () => {
  it('a Factory folder copied into My library exports as an .sfxlib and imports back the same, with nothing of the Factory left', async () => {
    const factory = (await loadFactoryModule()).createFactoryCatalog()
    const storage = createMemoryLibraryStorage(new Map())
    const copied = await storage.update((catalog) => copyLibraryEntries(factory, saveLibraryFolder(catalog, 'Mine', null, 'mine'), ['factory:effects', 'factory:drums/kick'], 'mine'))
    expect(JSON.stringify(copied)).not.toContain('factory:')
    const file = await exportLibraryBundle(copied, { folderIds: ['mine'] }, 'Mine', async () => undefined)
    const stage = await stageLibraryBundle(file.bytes)
    expect(stage.missing).toEqual([])
    const shape = (c: LibraryCatalog) => c.items.map((item) => [item.name, item.content.kind, 'revisionId' in item.content ? c.revisions.find((revision) => revision.id === (item.content as { revisionId: string }).revisionId)?.signature : undefined]).sort()
    expect(shape(stage.manifest.catalog)).toEqual(shape(copied))
    // Effects holds three track effects, four returns and two masters; Kick came on its own.
    expect(stage.manifest.catalog.items).toHaveLength(3 + 4 + 2 + 1)
    const imported = await commitLibraryBundle(createMemoryLibraryStorage(new Map()), stage)
    expect(shape(imported)).toEqual(shape(copied))
    expect(imported.folders.map((folder) => folder.name).sort()).toEqual(['Effects', 'Master', 'Mine', 'Mine', 'Returns', 'Tracks'])
  })

  it('retains v1 bundles with absent delay division and exchanges new synced divisions', async () => {
    const raw = JSON.parse(readFileSync(new URL('../core/persistence/fixtures/v7-delay-timing.sfxlab.json', import.meta.url), 'utf8'))
    const loaded = parseProject(JSON.stringify(raw)); if (!loaded.ok) throw new Error(loaded.error)
    const scope = { owner: { kind: 'track' as const, trackId: loaded.project.tracks[0]!.id }, domain: 'fx' as const }
    const old = captureLibraryAsset(emptyLibrary(), loaded.project, scope, 'Legacy echo', null)
    const file = await exportLibraryBundle(old, { itemIds: [old.items[0]!.id] }, 'Legacy', async () => undefined)
    expect(file.manifest.version).toBe(2)
    const stage = await stageLibraryBundle(file.bytes)
    expect(stage.manifest.catalog.revisions).toEqual(old.revisions)
    const graph = noteGraphFrom([{ id: 'in', type: 'trackIn' }, { id: 'delay', type: 'pingPong', params: { sync: 1, time: 0.75, division: 12 } }, { id: 'out', type: 'trackOut' }], ['in.out>delay.in', 'delay.out>out.in'])
    const p = { ...loaded.project, tracks: loaded.project.tracks.map(t => ({ ...t, fx: graph })) }
    const synced = captureLibraryAsset(emptyLibrary(), p, scope, 'Triplet', null)
    const imported = await stageLibraryBundle((await exportLibraryBundle(synced, { itemIds: [synced.items[0]!.id] }, 'Triplet', async () => undefined)).bytes)
    const destination = createEmptyProject()
    const inserted = insertLibraryAsset(destination, imported.manifest.catalog, imported.manifest.catalog.items[0]!, { mode: 'replace', scope: { owner: { kind: 'track', trackId: destination.tracks[0]!.id }, domain: 'fx' } })
    const reloaded = parseProject(serializeProject(inserted.project))
    expect(reloaded.ok && reloaded.project.tracks[0]!.fx.nodes.find(n => n.type === 'pingPong')?.params.division).toBe(12)
  })
  it('exports deterministic full folder closure, stages without writes, imports empty/conflicting/duplicate catalogs and inserts independent reloadable projects', async () => {
    const { c, read } = await fixture()
    const file = await exportLibraryBundle(c, { folderIds: ['collection'] }, 'Collection', read)
    expect(file.fileName).toBe('collection.sfxlib')
    expect((await exportLibraryBundle(c, { folderIds: ['collection'] }, 'Collection', read)).bytes).toEqual(file.bytes)
    const stage = await stageLibraryBundle(file.bytes), db = database(), storage = createLibraryStorage(db), samples = createIndexedDbSampleStorage(db)
    expect(await storage.read()).toEqual(emptyLibrary())
    expect(stage.manifest.catalog.items).toHaveLength(9)
    expect(stage.manifest.catalog.revisions.find(r => r.payload.kind === 'instrument')!.payload.modules.length).toBeGreaterThan(0)
    const imported = await commitLibraryBundle(storage, stage)
    expect(imported.items).toHaveLength(c.items.length)
    expect(imported.folders).toHaveLength(c.folders.length + 1)
    const second = await commitLibraryBundle(storage, stage)
    expect(second.items).toHaveLength(c.items.length * 2)
    expect(new Set(second.items.map(i => i.id)).size).toBe(second.items.length)
    expect(second.samples).toHaveLength(c.samples.length)
    for (const s of c.samples) expect(await samples.get(s.id)).toEqual(await read(s.id))
    for (const i of second.items) if (i.content.kind === 'preset') expect(second.items.find(a => i.content.kind === 'preset' && a.id === i.content.assetId)?.content).toMatchObject({ revisionId: i.content.revisionId })
    const conflictStorage = createLibraryStorage(database())
    await conflictStorage.update(() => c)
    const conflict = await commitLibraryBundle(conflictStorage, stage)
    expect(conflict.items.slice(0, c.items.length)).toEqual(c.items)
    expect(conflict.revisions.slice(0, c.revisions.length)).toEqual(c.revisions)
    let project = insertLibraryAsset(createEmptyProject(), imported, imported.items.find(i => i.content.kind === 'instrument')!, { mode: 'new-track' }).project
    const dest = project.tracks.at(-1)!.id
    project = insertLibraryAsset(project, imported, imported.items.find(i => i.content.kind === 'audio-effect')!, { mode: 'replace', scope: { owner: { kind: 'track', trackId: dest }, domain: 'fx' } }).project
    project = insertLibraryClip(project, imported, imported.items.find(i => i.content.kind === 'midi-clip')!, dest, 0).project
    const audioTrack = createAudioTrack('Destination', project.sceneCount)
    project = insertLibraryClip({ ...project, tracks: [...project.tracks, audioTrack] }, imported, imported.items.find(i => i.content.kind === 'audio-clip')!, audioTrack.id, 0).project
    await storage.update(c => trashLibraryEntry(c, imported.folders[0]!.id))
    const reloaded = parseProject(serializeProject(project)); expect(reloaded.ok && reloaded.project).toEqual(project)
    for (const preset of project.presets ?? []) expect(recallProjectPreset(project, preset).issues).toEqual([])
    const packageFile = await exportProject(project, samples.get), roundtrip = await importProject(packageFile.bytes)
    expect(packageFile.missing).toEqual([]); expect(roundtrip.ok && roundtrip.project).toEqual(project)
  })
  it('upgrades a legacy v1 bundle catalog while preserving strict manifest and normalized signatures', async () => {
    const { c, read } = await fixture()
    const files = Object.fromEntries(await Promise.all(c.samples.map(async sample => [`samples/${sample.id}`, (await read(sample.id))!] as const)))
    const catalog = { ...structuredClone(c), version: 1, revisions: structuredClone(c.revisions).map(revision => {
      const shape = JSON.parse(revision.signature)
      if (shape[0] === 'instrument') shape[1][0].nodes.reverse()
      return { ...revision, signature: JSON.stringify(shape) }
    }) }
    const stage = await stageLibraryBundle(archive({ format: 'sfx-lab-library', version: 1, name: 'Legacy', partial: false, missing: [], catalog }, files))
    expect(stage.manifest.version).toBe(2)
    expect(stage.manifest.catalog).toEqual(c)
    await expect(stageLibraryBundle(archive({ format: 'sfx-lab-library', version: 1, name: 'Legacy', partial: false, missing: [], catalog: emptyLibrary() }))).rejects.toThrow(/versions do not match/)
  })
  it('exchanges two-level sampled modules and per-use preset overrides through project reload', async () => {
    const { c: samples, read } = await fixture(), original = createEmptyProject()
    const inner: ModuleDefinition = { id: 'inner', name: 'Inner sampler', patch: createSamplerPatch(samples.samples[0]!.id), inputs: [], outputs: [], knobs: [] }
    const outer: ModuleDefinition = { id: 'outer', name: 'Outer sampler', patch: { nodes: [createModuleUse(inner, 0, 0)], connections: [] }, inputs: [], outputs: [], knobs: [] }
    const track = { ...original.tracks[0] as InstrumentTrack, patch: { nodes: [createModuleUse(outer, 0, 0)], connections: [] } }
    let p: Project = { ...original, tracks: [track], modules: [inner, outer], samples: samples.samples }
    const scope = { owner: { kind: 'track' as const, trackId: track.id }, domain: 'patch' as const }
    p = saveProjectPreset(p, scope, 'Shared default')
    p = editSampleBinding(p, { target: enumerateSampleTargets(p)[0]!, sampleId: samples.samples[1]!.id })
    p = saveProjectPreset(p, scope, 'Nested override')
    const captured = captureLibraryAsset(emptyLibrary(), p, scope, 'Nested', null)
    const stage = await stageLibraryBundle((await exportLibraryBundle(captured, { itemIds: [captured.items[0]!.id] }, 'Nested', read)).bytes)
    expect(stage.manifest.catalog.revisions[0]!.payload.modules).toHaveLength(2)
    expect(stage.blobs.size).toBe(2)
    const imported = await commitLibraryBundle(createLibraryStorage(database()), stage)
    const copy = insertLibraryAsset(createEmptyProject(), imported, imported.items.find(i => i.content.kind === 'instrument')!, { mode: 'new-track' }).project
    const reload = parseProject(serializeProject(copy))
    expect(reload.ok && reload.warnings).toEqual([])
    expect(reload.ok && reload.project).toEqual(copy)
    for (const preset of copy.presets!) expect(recallProjectPreset(copy, preset).issues).toEqual([])
    expect(copy.presets!.at(-1)!.samples[0]!.target.path).toHaveLength(2)
  })
  it('shares atomic content-hash blobs with memory sample storage and retains both on a conflicting import', async () => {
    const { c, read } = await fixture(), files = new Map<string, Uint8Array>(), storage = createMemoryLibraryStorage(files), samples = createMemorySampleStorage(files)
    const stage = await stageLibraryBundle((await exportLibraryBundle(c, { folderIds: ['collection'] }, 'Memory', read)).bytes)
    const saved = await commitLibraryBundle(storage, stage), sample = c.samples[0]!
    expect(await samples.get(sample.id)).toEqual(await read(sample.id))
    await samples.put(sample.id, Uint8Array.of(9))
    await expect(commitLibraryBundle(storage, stage)).rejects.toThrow(/conflict/)
    expect(await storage.read()).toEqual(saved)
    expect(await samples.get(sample.id)).toEqual(Uint8Array.of(9))
  })
  it('selected presets include their asset, sibling presets, immutable revision and ancestor folder path', async () => {
    const { c, read } = await fixture(), preset = c.items.find(i => i.content.kind === 'preset')!
    const file = await exportLibraryBundle(c, { itemIds: [preset.id] }, 'Sound', read)
    const stage = await stageLibraryBundle(file.bytes)
    expect(stage.manifest.catalog.items).toHaveLength(3)
    expect(stage.manifest.catalog.folders).toHaveLength(2)
    expect(stage.manifest.catalog.revisions).toHaveLength(1)
    expect(stage.blobs.size).toBe(2)
  })
  it('exports empty nested folders and overlapping selections in any order, and bounds destination capacity without writes', async () => {
    const { c, read } = await fixture()
    const withEmpty = saveLibraryFolder(c, 'Empty', 'nested', 'empty')
    const empty = await stageLibraryBundle((await exportLibraryBundle(withEmpty, { folderIds: ['empty'] }, 'Empty', read)).bytes)
    expect(empty.manifest.catalog.folders).toHaveLength(3)
    expect(empty.manifest.catalog.items).toHaveLength(0)
    const overlap = await exportLibraryBundle(c, { folderIds: ['nested', 'collection'] }, 'Overlap', read)
    expect((await stageLibraryBundle(overlap.bytes)).manifest.catalog.items).toHaveLength(9)
    const full = { ...emptyLibrary(), folders: Array.from({ length: 1024 }, (_, i) => ({ id: String(i), name: 'Full', parentId: null })) }
    expect(() => mergeLibraryBundle(full, emptyLibrary(), 'New root')).toThrow(/capacity/)
    expect(full.folders).toHaveLength(1024)
    expect(() => validateLibraryCatalog({ ...emptyLibrary(), revisions: c.revisions })).toThrow()
  })
  it('bounds module fan-out before flattening or constructing project copies', async () => {
    const { c } = await fixture(), base = c.revisions.find(r => r.payload.kind === 'instrument')!
    const modules = Array.from({ length: 16 }, (_, index) => ({
      id: `layer-${index}`, name: 'Layer', inputs: [], outputs: [], knobs: [],
      patch: { nodes: index === 0 ? [] : [0, 1].map(n => ({ id: `use-${index}-${n}`, type: 'module', moduleId: `layer-${index - 1}`, x: 0, y: 0, params: {} })), connections: [] },
    }))
    const revision = { ...base, payload: { ...base.payload, modules: [...base.payload.modules, ...modules] } }
    expect(() => validateLibraryCatalog({ ...c, revisions: c.revisions.map(r => r.id === base.id ? revision : r) })).toThrow(/expanded module/)
  })
  it('requires explicit partial export, marks missing bytes, stages the summary and refuses incomplete publish', async () => {
    const { c } = await fixture()
    await expect(exportLibraryBundle(c, { folderIds: ['collection'] }, 'Incomplete', async () => undefined)).rejects.toThrow(/incomplete/)
    const file = await exportLibraryBundle(c, { folderIds: ['collection'] }, 'Incomplete', async () => undefined, true)
    expect(file.fileName).toBe('incomplete-partial.sfxlib')
    const stage = await stageLibraryBundle(file.bytes)
    expect(stage.missing).toHaveLength(2)
    const storage = createLibraryStorage(database())
    await expect(commitLibraryBundle(storage, stage)).rejects.toThrow(/Incomplete/)
    expect(await storage.read()).toEqual(emptyLibrary())
    await expect(stageLibraryBundle(archive({ ...file.manifest, partial: false }))).rejects.toThrow(/marker/)
  })
  it('rejects bad hashes, sample sizes, missing content markers, unknown/future formats and malformed logical records', async () => {
    const { c, read } = await fixture(), file = await exportLibraryBundle(c, { folderIds: ['collection'] }, 'Bundle', read)
    const files = Object.fromEntries([...(await stageLibraryBundle(file.bytes)).blobs.entries()].map(([id, b]) => [`samples/${id}`, b]))
    const bad: LibraryBundleManifest = structuredClone(file.manifest)
    await expect(stageLibraryBundle(archive({ ...bad, version: 3 }, files))).rejects.toThrow(/version/)
    await expect(stageLibraryBundle(archive({ ...bad, format: 'sfx-lab-project' }, files))).rejects.toThrow(/format/)
    await expect(stageLibraryBundle(archive(bad, { ...files, [Object.keys(files)[0]!]: Uint8Array.of(8, 9, 8, 9) }))).rejects.toThrow(/hash/)
    await expect(stageLibraryBundle(archive(bad))).rejects.toThrow(/missing/)
    const mutations: ((c: LibraryCatalog) => unknown)[] = [
      c => ({ ...c, folders: c.folders.map(f => ({ ...f, parentId: f.id })) }),
      c => ({ ...c, items: [...c.items, c.items[0]] }),
      c => ({ ...c, items: c.items.map(i => i.content.kind === 'preset' ? { ...i, content: { ...i.content, assetId: i.id } } : i) }),
      c => ({ ...c, items: c.items.map(i => 'revisionId' in i.content ? { ...i, content: { ...i.content, revisionId: 'missing' } } : i) }),
      c => ({ ...c, revisions: c.revisions.map(r => ({ ...r, signature: 'forged' })) }),
      c => ({ ...c, samples: [] }),
      c => ({ ...c, items: c.items.map(i => ({ ...i, folderId: 'missing' })) }),
    ]
    for (const mutate of mutations) await expect(stageLibraryBundle(archive({ ...bad, catalog: mutate(structuredClone(c)) }, files))).rejects.toThrow()
  })
  it('rejects module dependency cycles, unknown graph records and undeclared nested sample dependencies', async () => {
    const { c, read } = await fixture(), file = await exportLibraryBundle(c, { folderIds: ['collection'] }, 'Bundle', read)
    const m = structuredClone(file.manifest), revision = m.catalog.revisions.find(r => r.payload.modules.length)!, module = revision.payload.modules[0]!
    const cyclic = { ...module, patch: { ...module.patch, nodes: [...module.patch.nodes, { id: 'cycle', type: 'module', moduleId: module.id, x: 0, y: 0, params: {} }] } }
    const revisions = m.catalog.revisions.map(r => r.id === revision.id ? { ...r, payload: { ...r.payload, modules: [cyclic, ...r.payload.modules.slice(1)] } } : r)
    await expect(stageLibraryBundle(archive({ ...m, catalog: { ...m.catalog, revisions } }))).rejects.toThrow(/cycle/)
    await expect(stageLibraryBundle(archive({ ...m, catalog: { ...m.catalog, revisions: m.catalog.revisions.map(r => ({ ...r, payload: { ...r.payload, sampleIds: [] } })) } }))).rejects.toThrow(/closure/)
  })
  it('keeps metadata and existing blobs intact on byte conflict, quota failure and post-request abort, then retries successfully', async () => {
    const { c, read } = await fixture(), stage = await stageLibraryBundle((await exportLibraryBundle(c, { folderIds: ['collection'] }, 'Bundle', read)).bytes)
    const db = database(), storage = createLibraryStorage(db), samples = createIndexedDbSampleStorage(db), id = c.samples[0]!.id
    const before = saveLibraryFolder(emptyLibrary(), 'Before', null, 'before')
    await storage.update(() => before)
    await samples.put(id, Uint8Array.of(9))
    await expect(commitLibraryBundle(storage, stage)).rejects.toThrow(/conflict/)
    expect(await storage.read()).toEqual(before); expect(await samples.get(id)).toEqual(Uint8Array.of(9))
    await samples.delete(id)
    const put = IDBObjectStore.prototype.put
    for (const mode of ['quota', 'abort']) {
      const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
        if (mode === 'quota' && this.name === 'samples') throw new DOMException('quota', 'QuotaExceededError')
        const request = put.call(this, value, key)
        if (mode === 'abort' && this.name === 'samples') request.addEventListener('success', () => this.transaction.abort())
        return request
      })
      try { await expect(commitLibraryBundle(storage, stage)).rejects.toThrow() } finally { spy.mockRestore() }
      expect(await createLibraryStorage(db).read()).toEqual(before)
      for (const s of c.samples) expect(await samples.get(s.id)).toBeUndefined()
    }
    const after = await commitLibraryBundle(storage, stage)
    expect(after.items).toHaveLength(c.items.length)
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put')
    try { await commitLibraryBundle(storage, stage); expect(spy.mock.instances.filter(store => (store as IDBObjectStore).name === 'samples')).toHaveLength(0) } finally { spy.mockRestore() }
  })
})

describe('hostile library archives', () => {
  it.each(['../manifest.json', '/manifest.json', 'samples/../x', 'samples\\evil', 'project.json', 'samples/ABC', 'extra'])('rejects unsafe/unknown path %s before decoding', async path => {
    await expect(stageLibraryBundle(zipSync({ 'manifest.json': strToU8('{}'), [path]: Uint8Array.of(1) }))).rejects.toThrow(/path/)
  })
  it('bounds compressed bytes, entries, individual/aggregate expanded bytes and mismatched local headers before allocation', async () => {
    await expect(stageLibraryBundle(new Uint8Array(LIBRARY_ARCHIVE_LIMITS.compressed + 1))).rejects.toThrow(/compressed/)
    const base = archive({}), modify = (change: (v: DataView, central: number, end: number) => void) => { const b = base.slice(), v = new DataView(b.buffer), end = b.length - 22, central = v.getUint32(end + 16, true); change(v, central, end); return b }
    await expect(stageLibraryBundle(modify((v, _c, e) => { v.setUint16(e + 8, 5000, true); v.setUint16(e + 10, 5000, true) }))).rejects.toThrow(/entry count/)
    await expect(stageLibraryBundle(modify((v, c) => v.setUint32(c + 24, LIBRARY_ARCHIVE_LIMITS.manifest + 1, true)))).rejects.toThrow(/expanded/)
    await expect(stageLibraryBundle(modify((v, c) => v.setUint32(c + 20, 999, true)))).rejects.toThrow(/mismatch/)
    await expect(stageLibraryBundle(modify(v => v.setUint16(6, 8, true)))).rejects.toThrow(/mismatch/)
    await expect(stageLibraryBundle(base.subarray(0, base.length - 1))).rejects.toThrow(/footer/)
  })
  it('bounds aggregate expanded bytes and rejects duplicate paths before any inflate', async () => {
    const files = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`samples/${i.toString(16).padStart(64, '0')}`, Uint8Array.of(0)]))
    const b = archive({}, files), v = new DataView(b.buffer), end = b.length - 22
    let cursor = v.getUint32(end + 16, true)
    while (cursor < end) {
      const nameLength = v.getUint16(cursor + 28, true), offset = v.getUint32(cursor + 42, true)
      if (nameLength !== 'manifest.json'.length) { v.setUint32(cursor + 24, LIBRARY_ARCHIVE_LIMITS.entry, true); v.setUint32(offset + 22, LIBRARY_ARCHIVE_LIMITS.entry, true) }
      cursor += 46 + nameLength
    }
    await expect(stageLibraryBundle(b)).rejects.toThrow(/expanded byte limit/)
    const a = 'samples/' + 'a'.repeat(64), z = 'samples/' + 'b'.repeat(64), dup = archive({}, { [a]: Uint8Array.of(0), [z]: Uint8Array.of(0) })
    const dv = new DataView(dup.buffer), de = dup.length - 22
    cursor = dv.getUint32(de + 16, true)
    while (cursor < de) {
      const length = dv.getUint16(cursor + 28, true), offset = dv.getUint32(cursor + 42, true)
      if (new TextDecoder().decode(dup.subarray(cursor + 46, cursor + 46 + length)) === z) { dup.set(strToU8(a), cursor + 46); dup.set(strToU8(a), offset + 30) }
      cursor += 46 + length
    }
    await expect(stageLibraryBundle(dup)).rejects.toThrow(/duplicate/)
  })
  it('checks actual expanded bytes rather than trusting forged originalSize, and checks CRC', async () => {
    const b = zipSync({ 'manifest.json': new Uint8Array(2 * 1024 * 1024).fill(32) }), v = new DataView(b.buffer), central = v.getUint32(b.length - 6, true)
    v.setUint32(22, 1, true); v.setUint32(central + 24, 1, true)
    await expect(stageLibraryBundle(b)).rejects.toThrow(/actual expanded/)
    const crc = archive({}), cv = new DataView(crc.buffer), cp = cv.getUint32(crc.length - 6, true)
    cv.setUint32(14, 0, true); cv.setUint32(cp + 16, 0, true)
    await expect(stageLibraryBundle(crc)).rejects.toThrow(/CRC/)
  })
  it('rejects object counts/depth before semantic parsing', async () => {
    await expect(stageLibraryBundle(archive({ junk: Array.from({ length: 100001 }, () => ({})) }))).rejects.toThrow(/object count/)
    let nested: unknown = {}; for (let i = 0; i < 70; i++) nested = { child: nested }
    await expect(stageLibraryBundle(archive(nested))).rejects.toThrow(/depth/)
  })
})
