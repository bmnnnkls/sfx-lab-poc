import { type AudioHost, decodeAudio } from '@audio'
import {
  EDIT_WAV_BIT_DEPTH,
  type PeakPyramid,
  type SampleAudio,
  type SampleData,
  type SampleEdit,
  type SampleInfo,
  afterEdit,
  applySampleEdit,
  buildPeakPyramid,
  bytesKeyOf,
  changedFrames,
  computePeaks,
  createDemoSamples,
  decodedBytes,
  encodeWavChannels,
  frameCount,
  originOf,
  editSuffix,
  peakOfRange,
  sampleRemap,
  savedFrameCount,
  updatePeakPyramid,
} from '@core'
import {
  type SampleLibrary,
  type WaveAudio,
  usePersistenceStore,
  useProjectStore,
  useSampleStore,
  useSelectionStore,
  useWaveAudioStore,
  useWaveEditorStore,
  waveViewOf,
} from '@state'
import { type SampleEditLog, type SampleStorage, StorageFullError, createMemorySampleEditLog, freeBytes, sha256Hex } from '@storage'
import { ENGINE_KEEP_ALIVE_BYTES, ROOM_FACTOR, WORKING_COPY_CACHE_BYTES } from './sample-budgets'
import { createWorkingCopies } from './working-copies'

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

/** What the service needs besides storage and the engine; tests stand in for each. */
export interface SampleLibraryOptions {
  /** Where the ids of files edits wrote are noted, for cleanup. */
  readonly edits?: SampleEditLog
  /** How many bytes the site may still store, or null when the browser doesn't say. */
  readonly freeBytes?: () => Promise<number | null>
  readonly now?: () => number
  /** The caches' budgets in bytes of decoded audio; `sample-budgets.ts` by default. */
  readonly budgets?: { readonly workingCopies?: number; readonly keepAlive?: number }
}

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`
const copyAudio = (audio: SampleAudio): SampleAudio => ({ sampleRate: audio.sampleRate, channels: audio.channels.map((channel) => channel.slice()) })

/**
 * Bridges three places a sample lives: the project (metadata), storage (original bytes) and
 * the audio engine (decoded floats). Everything here is keyed by the sample's content hash.
 */
export const createSampleLibrary = (storage: SampleStorage, host: AudioHost, options: SampleLibraryOptions = {}): SampleLibraryService => {
  const view = () => useSampleStore.getState()
  const notify = usePersistenceStore.getState().notify
  const edits = options.edits ?? createMemorySampleEditLog()
  const room = options.freeBytes ?? freeBytes
  const now = options.now ?? Date.now
  const keepAliveBudget = options.budgets?.keepAlive ?? ENGINE_KEEP_ALIVE_BYTES
  const copies = createWorkingCopies(options.budgets?.workingCopies ?? WORKING_COPY_CACHE_BYTES)

  /** What the engine holds, with the bytes of its decoded audio. */
  const inEngine = new Map<string, number>()
  /** When each sample the present no longer uses left it, so the first to leave is the first out past the budget. */
  const leftAt = new Map<string, number>()
  let leaving = 0
  const loading = new Map<string, Promise<void>>()

  /** Decoded audio goes to the engine (each channel transferred, not copied) and a thumbnail is kept for the UI. */
  const deliver = (id: string, decoded: { audio: SampleAudio }) => {
    const sample: SampleData = { id, ...decoded.audio }
    view().setPeaks(id, computePeaks(sample.channels, PEAK_BUCKETS))
    inEngine.set(id, decodedBytes(sample))
    host.send({ type: 'sample/add', sample }, sample.channels.map((channel) => channel.buffer as ArrayBuffer))
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
    const cached = copies.get(sampleId)
    if (cached) return waveAudio.setCurrent({ ...cached, viewKey: originOf(info) })
    waveAudio.setLoading(sampleId)
    try {
      const bytes = await storage.get(bytesKeyOf(info))
      const audio = bytes ? (await decodeAudio(bytes)).audio : null
      // Another sample may have been opened meanwhile; that one's load wins.
      if (useWaveAudioStore.getState().loading !== sampleId) return
      useWaveAudioStore.getState().setCurrent(audio && { sampleId, viewKey: originOf(info), audio, pyramid: buildPeakPyramid(audio) })
    } catch {
      if (useWaveAudioStore.getState().loading === sampleId) useWaveAudioStore.getState().setCurrent(null)
    }
  }

  /**
   * When the open sample's id leaves the project (an undo or redo of an edit, say), the editor follows the sample with
   * the same origin, if there is one, first in library order; its view, kept by origin, comes with it. A selection past
   * the new end is clamped. With none, the editor shows its empty state, as for a removed sample.
   */
  const follow = (previous: readonly SampleInfo[]) => {
    const sampleId = useSelectionStore.getState().sampleId
    const { samples } = useProjectStore.getState().project
    if (sampleId === null || samples.some((sample) => sample.id === sampleId)) return
    const was = previous.find((sample) => sample.id === sampleId)
    const next = was && samples.find((sample) => originOf(sample) === originOf(was))
    if (!next) return
    clampView(originOf(next), savedFrameCount(next))
    useSelectionStore.getState().selectSample(next.id)
  }

  const clampView = (key: string, frames: number) => {
    const store = useWaveEditorStore.getState()
    const { selection, cursor } = waveViewOf(store.views, key)
    if (cursor > frames) store.setView(key, { cursor: frames })
    if (selection && selection.to > frames) store.select(key, { ...selection, to: frames })
  }

  const removeFromEngine = (id: string) => {
    host.send({ type: 'sample/remove', sampleId: id })
    inEngine.delete(id)
    leftAt.delete(id)
    view().forget(id)
  }

  /** Loads the samples the present project has that the engine lacks. */
  const loadPresent = () => {
    for (const info of useProjectStore.getState().project.samples) void load(info)
  }

  /**
   * What the engine lets go (the keep-alive rule): a sample the present doesn't use stays while any history entry names
   * it, so undo plays it at once; past `keepAliveBudget` of such audio, the first to leave goes first; one no entry names
   * goes at once. Runs on every history change (a commit can drop the redo future without touching the present's
   * samples), so it reads only the `samples` arrays, each once (entries share them).
   */
  const keepAlive = () => {
    const { history } = useProjectStore.getState()
    const present = new Set(history.present.samples.map((sample) => sample.id))
    if ([...inEngine.keys()].every((id) => present.has(id))) return leftAt.clear()

    const named = new Set<string>()
    const seen = new WeakSet<readonly SampleInfo[]>()
    const name = (samples: readonly SampleInfo[]) => {
      if (seen.has(samples)) return
      seen.add(samples)
      for (const sample of samples) named.add(sample.id)
    }
    for (const entry of history.past) name(entry.samples)
    for (const entry of history.future) name(entry.samples)

    const kept: string[] = []
    let bytes = 0
    for (const [id, size] of inEngine) {
      if (present.has(id)) {
        leftAt.delete(id)
      } else if (!named.has(id)) {
        removeFromEngine(id)
      } else {
        if (!leftAt.has(id)) leftAt.set(id, leaving++)
        kept.push(id)
        bytes += size
      }
    }
    kept.sort((a, b) => leftAt.get(a)! - leftAt.get(b)!)
    for (const id of kept) {
      if (bytes <= keepAliveBudget) break
      bytes -= inEngine.get(id)!
      removeFromEngine(id)
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
    // Imported wins: bytes a user brings in are never cleaned up, even if an edit wrote them first.
    await edits.forget(bytesKeyOf(info))

    const known = useProjectStore.getState().project.samples.some((sample) => sample.id === id)
    if (!inEngine.has(id)) deliver(id, decoded)

    useProjectStore.getState().addSamples([info])
    return { name, known }
  }

  /** The audio an edit starts from: the working copy when it is this sample's, else the stored bytes decoded. */
  const audioOf = async (info: SampleInfo): Promise<{ audio: SampleAudio; pyramid: PeakPyramid | null } | null> => {
    const working = useWaveAudioStore.getState().current
    if (working?.sampleId === info.id) return { audio: working.audio, pyramid: working.pyramid }
    const cached = copies.get(info.id)
    if (cached) return { audio: cached.audio, pyramid: cached.pyramid }
    const bytes = await storage.get(bytesKeyOf(info))
    return bytes ? { audio: (await decodeAudio(bytes)).audio, pyramid: null } : null
  }

  /** Stores an edit's file and notes it as edit-made; false (with a toast) when there isn't room. */
  const store = async (info: SampleInfo, wav: Uint8Array): Promise<boolean> => {
    const key = bytesKeyOf(info)
    if (await storage.has(key)) return true
    const free = await room()
    if (free !== null && free < ROOM_FACTOR * wav.length) {
      notify('error', `Not enough browser storage for the edit: it needs ${megabytes(ROOM_FACTOR * wav.length)} free, and ${megabytes(free)} is.`)
      return false
    }
    try {
      await storage.put(key, wav)
      await edits.note(key, now())
      return true
    } catch (error) {
      notify('error', error instanceof StorageFullError ? `The edit was not saved: ${error.message}` : `The edit could not be stored: ${describe(error)}`)
      return false
    }
  }

  /** The editor moves onto the result: its working copy, its id, and the selection and cursor the edit leaves. */
  const moveEditor = (from: { info: SampleInfo; audio: SampleAudio }, to: WaveAudio, edit: SampleEdit) => {
    useWaveAudioStore.getState().setCurrent(to)
    const store = useWaveEditorStore.getState()
    const old = waveViewOf(store.views, originOf(from.info))
    if (to.viewKey !== originOf(from.info)) store.setView(to.viewKey, old)
    const after = afterEdit(edit, frameCount(from.audio))
    if (after !== 'keep') {
      const frames = frameCount(to.audio)
      const channels = old.selection?.channels ?? 'both'
      store.select(to.viewKey, after.selection && { ...after.selection, channels })
      store.setView(to.viewKey, { cursor: Math.min(after.cursor, frames) })
    }
    clampView(to.viewKey, frameCount(to.audio))
  }

  /**
   * Applies an edit to a sample (see `SampleLibrary.editSample`): read the audio, apply, encode as WAV
   * (`EDIT_WAV_BIT_DEPTH`), hash, check there is room, store and note the file, give the engine a copy, then commit, if
   * the sample is still in the project. Each refusal leaves the project as it was.
   */
  const runEdit = async (info: SampleInfo, edit: SampleEdit, asCopy: boolean) => {
    const source = await audioOf(info)
    if (!source) {
      notify('error', `The audio of "${info.name}" is missing; import the file again to edit it.`)
      return
    }
    const audio = applySampleEdit(source.audio, edit)
    const frames = frameCount(audio)
    if (frames === 0) {
      notify('error', 'Nothing left after the edit')
      return
    }
    const changed = changedFrames(edit, frameCount(source.audio))
    // Float WAV keeps a peak past full scale; the edit is kept, with a word.
    const peak = peakOfRange(audio, changed)
    const clipping = peak > 1 ? `The result peaks at +${(20 * Math.log10(peak)).toFixed(1)} dBFS, past full scale; lower the gain if it distorts.` : null
    const wav = encodeWavChannels(audio.channels, audio.sampleRate, EDIT_WAV_BIT_DEPTH)
    const id = await sha256Hex(wav)
    if (id === info.id) {
      notify('info', 'Nothing changed')
      return
    }
    const name = asCopy ? `${info.name} (${editSuffix(edit)})`.slice(0, 60) : info.name
    if (asCopy && useProjectStore.getState().project.samples.some((sample) => sample.id === id)) {
      notify('info', `"${name}" is already in the library`)
      return
    }
    const result: SampleInfo = {
      id,
      name,
      extension: 'wav',
      durationSeconds: frames / audio.sampleRate,
      sampleRate: audio.sampleRate,
      channels: audio.channels.length,
      bytes: wav.length,
    }
    if (!(await store(result, wav))) return
    // The engine has the new audio before anything points at it; the main thread keeps its own.
    if (!inEngine.has(id)) deliver(id, { audio: copyAudio(audio) })

    const project = useProjectStore.getState().project
    if (!project.samples.some((sample) => sample.id === info.id)) {
      notify('warning', `"${info.name}" left the project while it was being edited; the edit was dropped.`)
      return
    }
    const open = useSelectionStore.getState().sampleId === info.id
    // The pyramid redraws only what the edit changed.
    const pyramid = () =>
      source.pyramid ? updatePeakPyramid(source.pyramid, audio, changed) : buildPeakPyramid(audio)
    const working = (key: string, sampleId: string): WaveAudio => ({ sampleId, viewKey: key, audio, pyramid: pyramid() })

    if (asCopy) {
      // Added while the editor still shows the original, then opened with its working copy in place: nothing decodes.
      useProjectStore.getState().addSamples([result])
      if (open) moveEditor({ info, audio: source.audio }, working(id, id), edit)
      if (open) useSelectionStore.getState().selectSample(id)
      notify('info', `Added "${name}" to the library`)
      if (clipping) notify('warning', clipping)
      return
    }

    const merged = project.samples.find((sample) => sample.id === id)
    // The editor's working copy moves first, so following the sample to its new id finds it and decodes nothing.
    if (open) moveEditor({ info, audio: source.audio }, working(merged ? originOf(merged) : originOf(info), id), edit)
    const report = useProjectStore.getState().replaceSample(info.id, result, sampleRemap(edit, frameCount(source.audio), frames))
    if (open) useSelectionStore.getState().selectSample(id)
    if (report.merged) notify('info', `Already in the library as "${report.merged.name}"; its uses now point there.`)
    if (report.emptiedTrims > 0) {
      const count = report.emptiedTrims
      notify('warning', `${count} ${count === 1 ? 'clip was' : 'clips were'} trimmed to audio the edit removed.`)
    }
    if (clipping) notify('warning', clipping)
  }

  const editSample = async (sampleId: string, edit: SampleEdit, asCopy: boolean) => {
    const busy = useWaveAudioStore.getState()
    if (busy.editing !== null) return
    const info = useProjectStore.getState().project.samples.find((sample) => sample.id === sampleId)
    if (!info) return
    busy.setEditing(sampleId)
    try {
      await runEdit(info, edit, asCopy)
    } catch (error) {
      notify('error', `The edit failed: ${describe(error)}`)
    } finally {
      useWaveAudioStore.getState().setEditing(null)
    }
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

    editSample: (sampleId, edit, { asCopy }) => editSample(sampleId, edit, asCopy),

    connect: () => {
      loadPresent()
      keepAlive()
      void openAudio()
      const unsubscribeProject = useProjectStore.subscribe((state, previous) => {
        if (state.history === previous.history) return
        if (state.project.samples !== previous.project.samples) loadPresent()
        keepAlive()
        if (state.project.samples === previous.project.samples) return
        follow(previous.project.samples)
        void openAudio()
      })
      // A working copy the editor lets go of is kept for a while.
      const unsubscribeWave = useWaveAudioStore.subscribe((state, previous) => {
        if (previous.current && previous.current.sampleId !== state.current?.sampleId) copies.put(previous.current)
      })
      const unsubscribeSelection = useSelectionStore.subscribe((state, previous) => {
        if (state.sampleId !== previous.sampleId) void openAudio()
      })
      return () => {
        unsubscribeProject()
        unsubscribeSelection()
        unsubscribeWave()
      }
    },
  }
}
