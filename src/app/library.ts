import { decodeAudio } from '@audio'
import { type LibraryCatalog, type LibraryItem, type Project, type SampleData, captureLibraryAsset, captureLibraryClip, captureLibrarySample, insertLibraryAsset, insertLibraryClip, libraryDependencies, libraryPreviewProject, Bounce, commit } from '@core'
import { type PersonalLibrary, useProjectStore } from '@state'
import { type LibraryStorage, type SampleStorage, stageLibraryBundle, commitLibraryBundle, exportLibraryBundle, downloadFile } from '@storage'

/** All reusable payloads become copies in the document. Catalog edits never enter project history. */
export const createPersonalLibrary = (storage: LibraryStorage, samples: SampleStorage): PersonalLibrary => {
  let generation = 0, context: AudioContext | undefined, source: AudioBufferSourceNode | undefined
  const stopPreview = () => { generation++; if (source?.buffer) source.stop(); source?.disconnect(); source = undefined; if (context && context.state !== 'closed') void context.close(); context = undefined }
  const ensureBytes = async (catalog: LibraryCatalog, item: LibraryItem) => {
    for (const id of libraryDependencies(catalog, item).sampleIds) {
      if (!catalog.samples.some(s => s.id === id)) throw new Error(`Sample metadata missing (${id})`)
      if (!(await samples.has(id))) throw new Error(`Sample bytes missing (${id}); reimport the original sample before loading`)
    }
  }
  const save = async (capture: (catalog: LibraryCatalog, project: Project) => LibraryCatalog) => {
    const project = useProjectStore.getState().project
    // Preflight outside the IDB transaction. The actual capture repeats inside its serialized read/write callback.
    const previous = await storage.read(), preview = capture(previous, project)
    const added = preview.items.filter(i => !previous.items.some(known => known.id === i.id))
    for (const item of added) await ensureBytes(preview, item)
    return storage.update(catalog => capture(catalog, project))
  }
  const commitProject = (project: Project) => {
    const state = useProjectStore.getState()
    useProjectStore.setState({ project, history: commit(state.history, project, { now: Date.now() }) })
  }
  return {
    read: storage.read, update: storage.update, stopPreview,
    stageBundle: stageLibraryBundle,
    importBundle: stage => { stopPreview(); return commitLibraryBundle(storage, stage) },
    prepareBundle: async (selection, name) => {
      const exported = await exportLibraryBundle(await storage.read(), selection, name, samples.get, true)
      return stageLibraryBundle(exported.bytes)
    },
    exportBundle: async (stage, partial) => {
      const exported = await exportLibraryBundle(stage.manifest.catalog, { itemIds: stage.manifest.catalog.items.map(i => i.id), folderIds: stage.manifest.catalog.folders.map(f => f.id) }, stage.manifest.name, async id => stage.blobs.get(id), partial)
      downloadFile(exported.fileName, exported.mimeType, exported.bytes)
      return `Exported ${exported.manifest.catalog.items.length} items, ${exported.manifest.catalog.revisions.length} revisions, ${exported.manifest.catalog.samples.length} samples; ${exported.manifest.missing.length} missing${exported.manifest.partial ? ' · PARTIAL bundle' : ''}`
    },
    saveAsset: (scope, name, folder) => save((catalog, project) => captureLibraryAsset(catalog, project, scope, name, folder)),
    saveClip: (track, clip, name, folder) => save((catalog, project) => captureLibraryClip(catalog, project, track, clip, name, folder)),
    saveSample: (id, name, folder) => save((catalog, project) => captureLibrarySample(catalog, project, id, name, folder)),
    insert: async (selected, destination, scene = 0, replaceClip = false) => {
      const catalog = await storage.read(), item = catalog.items.find(i => i.id === selected.id && !i.trashed)
      if (!item) throw new Error('Library item was removed; refresh the catalog')
      await ensureBytes(catalog, item)
      const project = useProjectStore.getState().project
      if (item.content.kind === 'sample') {
        const sample = catalog.samples.find(s => item.content.kind === 'sample' && s.id === item.content.sampleId)
        if (!sample) throw new Error('Sample metadata is missing')
        if (project.samples.some(s => s.id === sample.id)) return 'Sample already in project'
        if (project.samples.length >= 256) throw new Error('Project sample limit reached')
        commitProject({ ...project, samples: [...project.samples, sample] }); return 'Sample added to project'
      }
      if (item.content.kind === 'midi-clip' || item.content.kind === 'audio-clip') {
        if (destination.scope?.owner.kind !== 'track') throw new Error('Choose a destination track')
        const result = insertLibraryClip(project, catalog, item, destination.scope.owner.trackId, scene, replaceClip)
        commitProject(result.project); return result.issues.length ? result.issues.join('; ') : 'Clip inserted as an independent copy'
      }
      const result = insertLibraryAsset(project, catalog, item, destination)
      commitProject(result.project); return 'Asset and presets copied into project'
    },
    preview: async selected => {
      stopPreview()
      const token = generation
      // Create/resume during the click gesture, before asynchronous storage/decode work.
      const previewContext = new AudioContext(), localSource = previewContext.createBufferSource()
      context = previewContext; source = localSource
      try {
        await previewContext.resume()
        const catalog = await storage.read(), item = catalog.items.find(i => i.id === selected.id && !i.trashed)
        if (!item) throw new Error('Item is unavailable')
        await ensureBytes(catalog, item)
        const decoded: SampleData[] = []
        for (const id of libraryDependencies(catalog, item).sampleIds) {
          const bytes = await samples.get(id)
          if (!bytes) throw new Error('Preview sample bytes are missing')
          const audio = await decodeAudio(bytes)
          decoded.push({ id, data: audio.mono, sampleRate: audio.sampleRate })
        }
        if (generation !== token) return
        let left: Float32Array, right: Float32Array, rate = 48000
        if (item.content.kind === 'sample') {
          left = decoded[0]!.data.slice(0, decoded[0]!.sampleRate * 4); right = left; rate = decoded[0]!.sampleRate
        } else {
          const project = libraryPreviewProject(catalog, item)
          const bounce = new Bounce(project, decoded, { scope: { kind: 'scene', scene: 0 }, bars: 1, maxTail: 0.5 })
          while (!bounce.done) { if (generation !== token) return; bounce.step(); await new Promise(resolve => setTimeout(resolve, 0)) }
          const result = bounce.result(); left = result.left; right = result.right; rate = result.sampleRate
        }
        if (generation !== token) return
        const buffer = previewContext.createBuffer(2, left.length, rate)
        buffer.copyToChannel(new Float32Array(left), 0); buffer.copyToChannel(new Float32Array(right), 1)
        localSource.buffer = buffer; localSource.connect(previewContext.destination)
        localSource.onended = () => { if (token === generation) stopPreview() }
        localSource.start()
      } catch (error) { if (token === generation) stopPreview(); throw error }
    },
  }
}
