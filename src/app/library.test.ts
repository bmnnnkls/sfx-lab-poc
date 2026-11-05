import { beforeEach, describe, expect, it } from 'vitest'
import { addSamplerTrack, addSamples, bytesKeyOf, createEmptyProject, createHistory, createAudioTrack, createClip, createNote, saveProjectPreset, saveLibraryFolder, trashLibraryEntry, parseProject, serializeProject, type InstrumentTrack } from '@core'
import { projectGraphItem, useProjectStore } from '@state'
import { createMemoryLibraryStorage, createMemorySampleStorage, exportProject, importProject, sha256Hex } from '@storage'
import { createPersonalLibrary } from './library'
const setup = () => {
  const p = createEmptyProject(), track = p.tracks[0] as InstrumentTrack
  const scope = { owner: { kind: 'track' as const, trackId: track.id }, domain: 'patch' as const }
  const project = saveProjectPreset(saveProjectPreset(p, scope, 'One'), scope, 'Two')
  useProjectStore.getState().resetProject(project)
  return { project, scope }
}
beforeEach(() => useProjectStore.getState().resetProject(createEmptyProject()))
describe('personal library service', () => {
  it('organizes an asset with two presets, effect/presets, MIDI/audio clips and a sample, then loads independent project copies with one undo step each and exports after trashing originals', async () => {
    const { scope } = setup(), storage = createMemoryLibraryStorage(), samples = createMemorySampleStorage(), library = createPersonalLibrary(storage, samples)
    await library.update(c => saveLibraryFolder(c, 'My collection', null, 'folder'))
    await library.saveAsset(scope, 'Instrument', 'folder')
    const fxScope = { ...scope, domain: 'fx' as const }
    const original = useProjectStore.getState().project
    useProjectStore.getState().resetProject(saveProjectPreset(saveProjectPreset(original, fxScope, 'Effect A'), fxScope, 'Effect B'))
    await library.saveAsset(fxScope, 'Effect', 'folder')
    const sampleId = await sha256Hex(Uint8Array.of(1, 2, 3, 4)), sample = { id: sampleId, name: 'Sample', extension: 'wav', durationSeconds: 1, sampleRate: 8000, channels: 1, bytes: 4 }
    await samples.put(sampleId, Uint8Array.of(1, 2, 3, 4))
    const midi = createClip('Notes', 4, [createNote(60, 0, 1)])
    const audio = { id: 'audio', name: 'Audio', sampleId, lengthBeats: 4, start: 0.1, end: 0.9, loop: true, warp: 'repitch' as const, gain: 0.8, fadeIn: 0.01, fadeOut: 0.02 }
    const source = useProjectStore.getState().project, audioTrack = { ...createAudioTrack('Audio', source.sceneCount), clips: [audio, ...Array.from({ length: source.sceneCount - 1 }, () => null)] }
    const withClips = { ...source, samples: [sample], tracks: [{ ...source.tracks[0] as InstrumentTrack, clips: [midi, ...Array.from({ length: source.sceneCount - 1 }, () => null)] }, audioTrack] }
    useProjectStore.getState().resetProject(withClips)
    await library.saveClip(scope.owner.trackId, midi.id, 'MIDI', 'folder')
    await library.saveClip(audioTrack.id, audio.id, 'Audio', 'folder')
    await library.saveSample(sampleId, 'Sample', 'folder')
    const catalog = await library.read()
    expect(catalog.items.map(i => i.content.kind).sort()).toEqual(['audio-clip', 'audio-effect', 'instrument', 'midi-clip', 'preset', 'preset', 'preset', 'preset', 'sample'].sort())
    expect(useProjectStore.getState().history.past).toHaveLength(0)
    useProjectStore.getState().resetProject(createEmptyProject())
    const instrument = catalog.items.find(i => i.content.kind === 'instrument')!, effect = catalog.items.find(i => i.content.kind === 'audio-effect')!
    await library.insert(instrument, { mode: 'new-track' })
    const inserted = useProjectStore.getState().project, destId = inserted.tracks.at(-1)!.id
    expect(useProjectStore.getState().history.past).toHaveLength(1)
    useProjectStore.getState().undo(); expect(useProjectStore.getState().project.tracks).toHaveLength(inserted.tracks.length - 1)
    useProjectStore.getState().redo(); expect(useProjectStore.getState().project).toEqual(inserted)
    await library.insert(effect, { mode: 'replace', scope: { owner: { kind: 'track', trackId: destId }, domain: 'fx' } })
    await library.insert(catalog.items.find(i => i.content.kind === 'midi-clip')!, { mode: 'replace', scope: { owner: { kind: 'track', trackId: destId }, domain: 'patch' } }, 0)
    await library.insert(catalog.items.find(i => i.content.kind === 'sample')!, { mode: 'replace' })
    const current = useProjectStore.getState().project
    useProjectStore.getState().resetProject({ ...current, tracks: [...current.tracks, { ...audioTrack, clips: audioTrack.clips.map(() => null) }] })
    await library.insert(catalog.items.find(i => i.content.kind === 'audio-clip')!, { mode: 'replace', scope: { owner: { kind: 'track', trackId: audioTrack.id }, domain: 'fx' } }, 0)
    const final = useProjectStore.getState().project
    await library.update(c => trashLibraryEntry(c, 'folder'))
    const reloaded = parseProject(serializeProject(final))
    expect(reloaded.ok && reloaded.project).toEqual(final)
    const file = await exportProject(final, samples.get), imported = await importProject(file.bytes)
    expect(file.missing).toEqual([])
    expect(imported.ok && imported.project).toEqual(final)
    expect(imported.ok && imported.samples.get(sampleId)).toEqual(Uint8Array.of(1, 2, 3, 4))
    expect(await samples.get(sampleId)).toEqual(Uint8Array.of(1, 2, 3, 4))
  })
  it('rejects missing bytes and stale deleted items without changing project or catalog history', async () => {
    const { scope } = setup(), storage = createMemoryLibraryStorage(), samples = createMemorySampleStorage(), library = createPersonalLibrary(storage, samples)
    await library.saveAsset(scope, 'Safe', null)
    const item = (await library.read()).items[0]!
    await library.update(c => trashLibraryEntry(c, item.id))
    const before = useProjectStore.getState()
    await expect(library.insert(item, { mode: 'new-track' })).rejects.toThrow(/removed/)
    expect(useProjectStore.getState()).toBe(before)
    const p = before.project, id = 'a'.repeat(64)
    useProjectStore.setState({ project: { ...p, samples: [{ id, name: 'Missing', extension: 'wav', sampleRate: 8000, bytes: 10, durationSeconds: 1, channels: 1 }] }, history: createHistory(p) })
    const catalog = await library.read()
    await expect(library.saveSample(id, 'Missing', null)).rejects.toThrow(/bytes missing/)
    expect(await library.read()).toEqual(catalog)
  })

  it('saves a project preset on its own after the same byte preflight', async () => {
    const { project } = setup(), storage = createMemoryLibraryStorage(), samples = createMemorySampleStorage(), library = createPersonalLibrary(storage, samples)
    const one = project.presets!.find(preset => preset.name === 'One')!
    await library.savePreset(one.id, null)
    expect((await library.read()).items.map(item => [item.name, item.content.kind])).toEqual([['One', 'instrument']])
    // A preset whose revision uses a sample whose bytes aren't stored is refused, and the catalog stays as it was.
    const id = 'b'.repeat(64), info = { id, name: 'Missing', extension: 'wav', sampleRate: 8000, bytes: 10, durationSeconds: 1, channels: 1 }
    useProjectStore.getState().resetProject({ ...project, samples: [info], assetRevisions: project.assetRevisions!.map(revision => revision.id === one.revisionId ? { ...revision, payload: { ...revision.payload, sampleIds: [id] } } : revision) })
    const catalog = await library.read()
    await expect(library.savePreset(one.id, null)).rejects.toThrow(/bytes missing/)
    expect(await library.read()).toEqual(catalog)
  })
})

it('returns explicit cancellation for stale preview success/errors and keeps the newer audio context alive', async () => {
  const { scope } = setup(), storage = createMemoryLibraryStorage(), samples = createMemorySampleStorage()
  const saved = createPersonalLibrary(storage, samples)
  await saved.saveAsset(scope, 'Preview', null)
  const catalog = await storage.read(), item = catalog.items[0]!
  const contexts: FakeContext[] = []
  class FakeContext {
    state = 'running'
    destination = {}
    source = { buffer: undefined as unknown, disconnect: () => {}, stop: () => {}, connect: () => {}, start: () => { this.started = true }, onended: undefined as unknown }
    started = false
    constructor() { contexts.push(this) }
    async resume() {}
    async close() { this.state = 'closed' }
    createBufferSource() { return this.source }
    createBuffer() { return { copyToChannel: () => {} } }
  }
  const previous = globalThis.AudioContext
  Object.assign(globalThis, { AudioContext: FakeContext })
  try {
    for (const fail of [false, true]) {
      let resolve!: (c: typeof catalog) => void, reject!: (error: Error) => void, reads = 0
      const library = createPersonalLibrary({ ...storage, read: () => ++reads === 1 ? new Promise((yes, no) => { resolve = yes; reject = no }) : storage.read() }, samples)
      const stops: string[] = []
      const a = library.preview(item, () => stops.push('a'))
      await Promise.resolve(); library.stopPreview()
      const b = library.preview(item, () => stops.push('b'))
      expect(await b).toBe('started')
      // Each preview hears once that it stopped: the first when it was stopped, the second not yet.
      expect(stops).toEqual(['a'])
      const current = contexts.at(-1)!
      if (fail) reject(new Error('Old read failed')); else resolve(catalog)
      expect(await a).toBe('cancelled')
      expect(current.started).toBe(true); expect(current.state).toBe('running')
      library.stopPreview(); expect(current.state).toBe('closed')
      expect(stops).toEqual(['a', 'b'])
    }
    const broken = createPersonalLibrary({ ...storage, read: async () => { throw new Error('Current read failed') } }, samples)
    await expect(broken.preview(item)).rejects.toThrow('Current read failed')
    expect(contexts.every(c => c.state === 'closed')).toBe(true)
  } finally { Object.assign(globalThis, { AudioContext: previous }) }
})

it('the deferred library passes a preview its stop callback, and calls it for a preview cancelled while loading', async () => {
  const { createDeferredPersonalLibrary } = await import('./library-service')
  const deferred = createDeferredPersonalLibrary(createMemoryLibraryStorage(), createMemorySampleStorage())
  const stops: string[] = []
  const item = { id: 'gone', name: 'Gone', folderId: null, content: { kind: 'sample', sampleId: 's' } } as const
  const first = deferred.preview(item, () => stops.push('first'))
  deferred.stopPreview()
  expect(await first).toBe('cancelled')
  expect(stops).toEqual(['first'])
  // Loaded now, the callback reaches the library (here, with no AudioContext, the preview throws), which calls it as it stops.
  await expect(deferred.preview(item, () => stops.push('second'))).rejects.toThrow()
  deferred.stopPreview()
  expect(stops).toEqual(['first', 'second'])
})

describe('a source catalog in place of storage', () => {
  it('copies a graph of the project to a new track in one undo step, leaving the library alone', async () => {
    const { project, scope } = setup(), storage = createMemoryLibraryStorage(), library = createPersonalLibrary(storage, createMemorySampleStorage())
    const { catalog, item } = projectGraphItem(project, scope.owner, 'patch', 'Track copy')
    expect(await library.insert(item, { mode: 'new-track' }, undefined, undefined, catalog)).toBe('Asset and presets copied into project')
    const copied = useProjectStore.getState().project
    expect(copied.tracks.map(t => t.name)).toEqual([...project.tracks.map(t => t.name), 'Track copy'])
    expect(copied.presets?.filter(p => p.scope.owner.kind === 'track' && p.scope.owner.trackId === copied.tracks.at(-1)!.id).map(p => p.name)).toEqual(['Track copy', 'One', 'Two'])
    expect(useProjectStore.getState().history.past).toHaveLength(1)
    useProjectStore.getState().undo()
    expect(useProjectStore.getState().project.tracks).toHaveLength(project.tracks.length)
    expect((await storage.read()).items).toEqual([])
  })

  it("previews a sampled instrument of the project, finding its bytes in the project's sample storage", async () => {
    const bytes = Uint8Array.of(9, 8, 7, 6), sampleId = await sha256Hex(bytes)
    const sample = { id: sampleId, name: 'Hit', extension: 'wav', durationSeconds: 0.01, sampleRate: 8000, channels: 1, bytes: 4 }
    const project = addSamplerTrack(addSamples(createEmptyProject(), [sample]), sample)
    useProjectStore.getState().resetProject(project)
    const owner = { kind: 'track' as const, trackId: project.tracks.at(-1)!.id }
    const { catalog, item } = projectGraphItem(project, owner, 'patch', 'Hit')
    const samples = createMemorySampleStorage(), library = createPersonalLibrary(createMemoryLibraryStorage(), samples)
    class FakeContext {
      state = 'running'; destination = {}
      source = { buffer: undefined as unknown, disconnect: () => {}, stop: () => {}, connect: () => {}, start: () => {}, onended: undefined as unknown }
      async resume() {}
      async close() { this.state = 'closed' }
      createBufferSource() { return this.source }
      createBuffer() { return { copyToChannel: () => {} } }
    }
    class FakeOffline { async decodeAudioData() { return { duration: 0.01, numberOfChannels: 1, sampleRate: 8000, getChannelData: () => new Float32Array(80).fill(0.5) } } }
    const previous = { AudioContext: globalThis.AudioContext, OfflineAudioContext: globalThis.OfflineAudioContext }
    Object.assign(globalThis, { AudioContext: FakeContext, OfflineAudioContext: FakeOffline })
    try {
      await expect(library.preview(item, undefined, catalog)).rejects.toThrow('Sample bytes missing')
      await samples.put(bytesKeyOf(sample), bytes)
      expect(await library.preview(item, undefined, catalog)).toBe('started')
      library.stopPreview()
    } finally { Object.assign(globalThis, previous) }
  })
})
