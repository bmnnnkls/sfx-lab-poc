import { type AudioHost, decodeAudio } from '@audio'
import {
  EDIT_WAV_BIT_DEPTH,
  type SampleAudio,
  type SampleData,
  type SampleEdit,
  type SampleInfo,
  applySampleEdit,
  buildPeakPyramid,
  bytesKeyOf,
  computePeaks,
  createDemoSamples,
  encodeWavChannels,
  frameCount,
  sampleEditEntry,
} from '@core'
import { type SampleLibrary, usePersistenceStore, useProjectStore, useSampleStore, useSelectionStore, useWaveAudioStore } from '@state'
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

  /** Decoded audio goes to the engine (each channel transferred, not copied) and a thumbnail is kept for the UI. */
  const deliver = (id: string, decoded: { audio: SampleAudio }) => {
    const sample: SampleData = { id, ...decoded.audio }
    view().setPeaks(id, computePeaks(sample.channels, PEAK_BUCKETS))
    host.send({ type: 'sample/add', sample }, sample.channels.map((channel) => channel.buffer as ArrayBuffer))
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
        const bytes = await storage.get(bytesKeyOf(info))
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

  /**
   * The working copy: the decoded audio of the sample open in the Wave editor, and its peak pyramid, on the main thread
   * (the engine's copy was transferred). Decoded again from storage when the editor opens a sample; dropped when it
   * closes, or when the project no longer has the sample.
   */
  const openAudio = async () => {
    const sampleId = useSelectionStore.getState().sampleId
    const waveAudio = useWaveAudioStore.getState()
    const info = sampleId === null ? undefined : useProjectStore.getState().project.samples.find((sample) => sample.id === sampleId)
    if (!info || sampleId === null) {
      if (waveAudio.current || waveAudio.loading) waveAudio.setCurrent(null)
      return
    }
    if (waveAudio.current?.sampleId === sampleId || waveAudio.loading === sampleId) return
    waveAudio.setLoading(sampleId)
    try {
      const bytes = await storage.get(bytesKeyOf(info))
      const audio = bytes ? (await decodeAudio(bytes)).audio : null
      // Another sample may have been opened meanwhile; that one's load wins.
      if (useWaveAudioStore.getState().loading !== sampleId) return
      useWaveAudioStore.getState().setCurrent(audio && { sampleId, audio, pyramid: buildPeakPyramid(audio) })
    } catch {
      if (useWaveAudioStore.getState().loading === sampleId) useWaveAudioStore.getState().setCurrent(null)
    }
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
    const info: SampleInfo = {
      id,
      name,
      extension,
      durationSeconds: decoded.durationSeconds,
      sampleRate: decoded.audio.sampleRate,
      channels: decoded.channels,
      bytes: bytes.length,
    }
    if (!(await storage.has(bytesKeyOf(info)))) await storage.put(bytesKeyOf(info), bytes)

    const known = useProjectStore.getState().project.samples.some((sample) => sample.id === id)
    if (!inEngine.has(id)) deliver(id, decoded)

    useProjectStore.getState().addSamples([info])
    return { name, known }
  }

  /**
   * Applies an edit to a sample's audio and adds the result as a copy: encoded as WAV (`EDIT_WAV_BIT_DEPTH`, one or two
   * channels) and hashed like any import.
   */
  const editSample = async (sampleId: string, edit: SampleEdit) => {
    const info = useProjectStore.getState().project.samples.find((sample) => sample.id === sampleId)
    if (!info) return
    // The open sample's working copy, or the stored bytes decoded again.
    const working = useWaveAudioStore.getState().current
    const open = working?.sampleId === sampleId ? working.audio : null
    const bytes = open ? null : await storage.get(bytesKeyOf(info))
    if (!open && !bytes) {
      notify('error', `The audio of "${info.name}" is missing; import the file again to edit it.`)
      return
    }
    const source = open ?? (await decodeAudio(bytes!)).audio
    const audio = applySampleEdit(source, edit)
    const frames = frameCount(audio)
    if (frames === 0) {
      notify('error', 'Nothing left after the edit')
      return
    }
    const wav = encodeWavChannels(audio.channels, audio.sampleRate, EDIT_WAV_BIT_DEPTH)
    const id = await sha256Hex(wav)
    const name = `${info.name} (${sampleEditEntry(edit.kind).suffix})`.slice(0, 60)
    if (useProjectStore.getState().project.samples.some((sample) => sample.id === id)) {
      notify('info', `"${name}" is already in the library`)
      return
    }
    const copy: SampleInfo = {
      id,
      name,
      extension: 'wav',
      durationSeconds: frames / audio.sampleRate,
      sampleRate: audio.sampleRate,
      channels: audio.channels.length,
      bytes: wav.length,
    }
    if (!(await storage.has(bytesKeyOf(copy)))) await storage.put(bytesKeyOf(copy), wav)
    useProjectStore.getState().addSamples([copy])
    notify('info', `Added "${name}" to the library`)
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

    preview: (sampleId, range) => {
      void host.start()
      host.send({ type: 'sample/preview', sampleId, ...range })
    },
    stopPreview: () => host.send({ type: 'sample/stopPreview' }),

    editSample: (sampleId, edit) => editSample(sampleId, edit),

    connect: () => {
      syncWithProject()
      void openAudio()
      const unsubscribeProject = useProjectStore.subscribe((state, previous) => {
        if (state.project.samples === previous.project.samples) return
        syncWithProject()
        void openAudio()
      })
      const unsubscribeSelection = useSelectionStore.subscribe((state, previous) => {
        if (state.sampleId !== previous.sampleId) void openAudio()
      })
      return () => {
        unsubscribeProject()
        unsubscribeSelection()
      }
    },
  }
}
