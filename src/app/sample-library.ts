import { type AudioHost, decodeAudio } from '@audio'
import { type SampleData, type SampleInfo, computePeaks, createDemoSamples } from '@core'
import { type SampleLibrary, usePersistenceStore, useProjectStore, useSampleStore } from '@state'
import { type SampleStorage, sha256Hex } from '@storage'

/** Enough detail for the large clip waveform; thumbnails simply sample it more coarsely. */
const PEAK_BUCKETS = 800
const MAX_FILE_BYTES = 32 * 1024 * 1024

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const splitFileName = (fileName: string): { name: string; extension: string } => {
  const dot = fileName.lastIndexOf('.')
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName
  const extension = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : ''
  return {
    name: stem.trim().slice(0, 60) || 'Sample',
    extension: /^[a-z0-9]{1,5}$/.test(extension) ? extension : 'bin',
  }
}

export interface SampleLibraryService extends SampleLibrary {
  /** Loads the project's samples into the engine and keeps doing so as the library changes. */
  connect(): () => void
}

/**
 * Bridges three places a sample lives: the project (metadata), storage (original bytes) and
 * the audio engine (decoded floats). Everything here is keyed by the sample's content hash.
 */
export const createSampleLibrary = (storage: SampleStorage, host: AudioHost): SampleLibraryService => {
  const view = () => useSampleStore.getState()
  const notify = usePersistenceStore.getState().notify

  const inEngine = new Set<string>()
  const loading = new Map<string, Promise<void>>()

  /** Decoded audio goes to the engine (transferred, not copied) and a thumbnail is kept for the UI. */
  const deliver = (id: string, decoded: { mono: Float32Array; sampleRate: number }) => {
    const sample: SampleData = { id, sampleRate: decoded.sampleRate, data: decoded.mono }
    view().setPeaks(id, computePeaks(decoded.mono, PEAK_BUCKETS))
    host.send({ type: 'sample/add', sample }, [decoded.mono.buffer])
    inEngine.add(id)
    view().setStatus(id, 'ready')
  }

  const load = (info: SampleInfo): Promise<void> => {
    const existing = loading.get(info.id)
    if (existing) return existing
    if (inEngine.has(info.id)) return Promise.resolve()

    view().setStatus(info.id, 'loading')
    const task = (async () => {
      try {
        const bytes = await storage.get(info.id)
        if (!bytes) {
          view().setStatus(info.id, 'missing')
          return
        }
        deliver(info.id, await decodeAudio(bytes))
      } catch {
        view().setStatus(info.id, 'error')
      } finally {
        loading.delete(info.id)
      }
    })()
    loading.set(info.id, task)
    return task
  }

  const syncWithProject = () => {
    const { samples } = useProjectStore.getState().project
    const wanted = new Set(samples.map((sample) => sample.id))

    for (const info of samples) void load(info)
    for (const id of [...inEngine]) {
      if (wanted.has(id)) continue
      host.send({ type: 'sample/remove', sampleId: id })
      inEngine.delete(id)
      view().forget(id)
    }
  }

  /** Adds one file to the library. Reports whether it was new; the caller decides what to tell the user. */
  const ingest = async (bytes: Uint8Array, fileName: string): Promise<{ name: string; known: boolean }> => {
    const { name, extension } = splitFileName(fileName)
    if (bytes.length > MAX_FILE_BYTES) {
      throw new Error(`Files over ${MAX_FILE_BYTES / 1024 / 1024} MB are not supported`)
    }

    const id = await sha256Hex(bytes)
    const decoded = await decodeAudio(bytes)
    if (!(await storage.has(id))) await storage.put(id, bytes)

    const known = useProjectStore.getState().project.samples.some((sample) => sample.id === id)
    if (!inEngine.has(id)) deliver(id, decoded)

    useProjectStore.getState().addSamples([
      {
        id,
        name,
        extension,
        durationSeconds: decoded.durationSeconds,
        sampleRate: decoded.sampleRate,
        channels: decoded.channels,
        bytes: bytes.length,
      },
    ])
    return { name, known }
  }

  /** Adds several files, then tells the user once (not once per file). */
  const ingestAll = async (items: ReadonlyArray<{ bytes: () => Promise<Uint8Array>; fileName: string }>) => {
    const added: string[] = []
    const already: string[] = []
    for (const item of items) {
      try {
        const { name, known } = await ingest(await item.bytes(), item.fileName)
        ;(known ? already : added).push(name)
      } catch (error) {
        notify('error', `Could not add "${item.fileName}": ${describe(error)}`)
      }
    }

    if (added.length === 1 && already.length === 0) notify('info', `Added sample "${added[0]}"`)
    else if (added.length > 0) {
      const extra = already.length > 0 ? ` (${already.length} already in the library)` : ''
      notify('info', `Added ${added.length} samples${extra}`)
    } else if (already.length === 1) notify('info', `"${already[0]}" is already in the library`)
    else if (already.length > 1) notify('info', `All ${already.length} samples were already in the library`)
  }

  return {
    importFiles: (files) =>
      ingestAll(
        files.map((file) => ({
          fileName: file.name,
          bytes: async () => new Uint8Array(await file.arrayBuffer()),
        })),
      ),

    addDemoSamples: () =>
      ingestAll(
        createDemoSamples().map((sample) => ({
          fileName: `${sample.name}.wav`,
          bytes: async () => sample.bytes,
        })),
      ),

    preview: (sampleId) => {
      void host.start()
      host.send({ type: 'sample/preview', sampleId })
    },
    stopPreview: () => host.send({ type: 'sample/stopPreview' }),

    connect: () => {
      syncWithProject()
      return useProjectStore.subscribe((state, previous) => {
        if (state.project.samples !== previous.project.samples) syncWithProject()
      })
    },
  }
}
