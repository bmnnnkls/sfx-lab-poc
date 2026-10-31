import { type AudioHost, type SpectrumService, decodeAudio } from '@audio'
import {
  EDIT_WAV_BIT_DEPTH,
  type FrameMap,
  type PeakPyramid,
  type SampleAudio,
  type SampleData,
  type SampleEdit,
  type SampleInfo,
  afterEdit,
  applySampleEdit,
  isBandEdit,
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
  originalInfo,
  peakOfRange,
  revertRemap,
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
  WAVE_PANES,
  type WavePane,
  paneSampleId,
  useWaveEditorStore,
  useWavePanesStore,
  waveViewKey,
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
  /** Where band edits are applied, off the main thread; without it, on it (`applySampleEdit`). */
  readonly spectrum?: Pick<SpectrumService, 'applyOf'>
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

  /** A sample's audio and pyramid decoded from storage, once however many panes ask at the same time. */
  const decoding = new Map<string, Promise<{ audio: SampleAudio; pyramid: PeakPyramid } | null>>()
  const decodeWorking = (info: SampleInfo) => {
    const running = decoding.get(info.id)
    if (running) return running
    const task = (async () => {
      const bytes = await storage.get(bytesKeyOf(info))
      if (!bytes) return null
      const { audio } = await decodeAudio(bytes)
      return { audio, pyramid: buildPeakPyramid(audio) }
    })().finally(() => decoding.delete(info.id))
    decoding.set(info.id, task)
    return task
  }

  /** A pane's working copy of `info`, sharing the audio of another copy of the same sample. */
  const workingFor = (pane: WavePane, info: SampleInfo, from: { audio: SampleAudio; pyramid: PeakPyramid }): WaveAudio => ({
    sampleId: info.id,
    pane,
    viewKey: waveViewKey(pane, originOf(info)),
    audio: from.audio,
    pyramid: from.pyramid,
  })

  /**
   * A pane's working copy: the decoded audio of the sample it shows (`paneSampleId`), and its peak pyramid, on the main
   * thread (the engine's copy was transferred). Another pane's copy of the same sample is shared; otherwise one kept in
   * `copies`, else decoded from storage. Dropped when the pane closes or shows nothing, or the project no longer has
   * the sample.
   */
  const openAudio = async (pane: WavePane) => {
    const sampleId = paneSampleId(pane)
    const waveAudio = useWaveAudioStore.getState()
    const info = sampleId === null ? undefined : useProjectStore.getState().project.samples.find((sample) => sample.id === sampleId)
    if (!info) {
      if (waveAudio.panes[pane] || waveAudio.loading[pane]) waveAudio.setPane(pane, null)
      return
    }
    if (waveAudio.panes[pane]?.sampleId === info.id || waveAudio.loading[pane] === info.id) return
    const shared = WAVE_PANES.map((other) => waveAudio.panes[other]).find((held) => held?.sampleId === info.id) ?? copies.get(info.id)
    if (shared) return waveAudio.setPane(pane, workingFor(pane, info, shared))
    waveAudio.setLoading(pane, info.id)
    try {
      const decoded = await decodeWorking(info)
      // The pane may have been pointed at another sample meanwhile; that one's load wins.
      if (useWaveAudioStore.getState().loading[pane] !== info.id) return
      useWaveAudioStore.getState().setPane(pane, decoded && workingFor(pane, info, decoded))
    } catch {
      if (useWaveAudioStore.getState().loading[pane] === info.id) useWaveAudioStore.getState().setPane(pane, null)
    }
  }
  const openPanes = () => {
    for (const pane of WAVE_PANES) void openAudio(pane)
  }

  /** Points a pane at a sample: the first pane's is the editor's (`selectSample`), the second's its own. */
  const showInPane = (pane: WavePane, sampleId: string) =>
    pane === 'main' ? useSelectionStore.getState().selectSample(sampleId) : useWavePanesStore.getState().setSecond({ sampleId })

  /**
   * When the sample a pane is set to show leaves the project (an undo or redo of an edit, say), the pane follows the
   * sample with the same origin, if there is one, first in library order; its view, kept by origin, comes with it. With
   * none, the first pane shows the editor's empty state, as for a removed sample, and the second the first pane's
   * sample. A selection past a sample's new end is clamped.
   */
  const follow = (previous: readonly SampleInfo[]) => {
    const { samples } = useProjectStore.getState().project
    for (const pane of WAVE_PANES) {
      // The second pane without a sample of its own shows the first's, so follows it.
      const sampleId = pane === 'main' ? useSelectionStore.getState().sampleId : useWavePanesStore.getState().second.sampleId
      if (sampleId === null || samples.some((sample) => sample.id === sampleId)) continue
      const was = previous.find((sample) => sample.id === sampleId)
      const next = was && samples.find((sample) => originOf(sample) === originOf(was))
      if (next) showInPane(pane, next.id)
    }
    for (const pane of WAVE_PANES) {
      const info = samples.find((sample) => sample.id === paneSampleId(pane))
      if (info) clampView(waveViewKey(pane, originOf(info)), savedFrameCount(info))
    }
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

  /** The audio an edit starts from: a pane's working copy when one has this sample, else the stored bytes decoded. */
  const audioOf = async (info: SampleInfo): Promise<{ audio: SampleAudio; pyramid: PeakPyramid | null } | null> => {
    const { panes } = useWaveAudioStore.getState()
    const working = WAVE_PANES.map((pane) => panes[pane]).find((held) => held?.sampleId === info.id)
    if (working) return { audio: working.audio, pyramid: working.pyramid }
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

  /** The pane an edit was asked from moves onto the result: its working copy, and the selection and cursor the edit leaves. */
  const moveEdited = (from: { info: SampleInfo; audio: SampleAudio }, to: WaveAudio, edit: SampleEdit) => {
    useWaveAudioStore.getState().setPane(to.pane, to)
    const store = useWaveEditorStore.getState()
    const fromKey = waveViewKey(to.pane, originOf(from.info))
    const old = waveViewOf(store.views, fromKey)
    if (to.viewKey !== fromKey) store.setView(to.viewKey, old)
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
   * Another pane showing the changed sample moves onto the result too, still looking at the same audio: its cursor,
   * scroll and selection go through the change's map (a selection whose audio is gone goes).
   */
  const moveAlong = (from: SampleInfo, to: WaveAudio, remap: FrameMap) => {
    useWaveAudioStore.getState().setPane(to.pane, to)
    const store = useWaveEditorStore.getState()
    const old = waveViewOf(store.views, waveViewKey(to.pane, originOf(from)))
    const frames = frameCount(to.audio)
    const at = (position: number) => Math.max(0, Math.min(frames, Math.round(remap.start(position))))
    const range = old.selection && remap.range(old.selection)
    store.setView(to.viewKey, { ...old, cursor: at(old.cursor), startFrame: at(old.startFrame) })
    store.select(to.viewKey, range && old.selection && { ...old.selection, from: Math.round(range.from), to: Math.round(range.to) })
    clampView(to.viewKey, frames)
  }

  /** The panes showing a sample now. */
  const panesShowing = (sampleId: string) => WAVE_PANES.filter((pane) => paneSampleId(pane) === sampleId)

  /**
   * Applies an edit to a sample (see `SampleLibrary.editSample`): read the audio, apply, encode as WAV
   * (`EDIT_WAV_BIT_DEPTH`), hash, check there is room, store and note the file, give the engine a copy, then commit, if
   * the sample is still in the project. Each refusal leaves the project as it was.
   */
  const runEdit = async (info: SampleInfo, edit: SampleEdit, asCopy: boolean, pane: WavePane) => {
    const source = await audioOf(info)
    if (!source) {
      notify('error', `The audio of "${info.name}" is missing; import the file again to edit it.`)
      return
    }
    const audio = isBandEdit(edit) && options.spectrum ? await options.spectrum.applyOf(source.audio, edit) : applySampleEdit(source.audio, edit)
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
    const showing = panesShowing(info.id)
    const edited = showing.includes(pane) ? pane : null
    // The pyramid redraws only what the edit changed; the panes on the sample share it.
    let made: { audio: SampleAudio; pyramid: PeakPyramid } | null = null
    const working = (into: WavePane, origin: string): WaveAudio => {
      made ??= { audio, pyramid: source.pyramid ? updatePeakPyramid(source.pyramid, audio, changed) : buildPeakPyramid(audio) }
      return { sampleId: id, pane: into, viewKey: waveViewKey(into, origin), ...made, editedFrom: { sampleId: info.id, changed } }
    }
    const from = { info, audio: source.audio }

    if (asCopy) {
      // Added while the pane still shows the original, then opened with its working copy in place: nothing decodes.
      useProjectStore.getState().addSamples([result])
      if (edited) {
        // Only the pane the edit was asked from moves to the copy: a second pane showing the first's sample keeps the original.
        if (edited === 'main' && showing.includes('second') && useWavePanesStore.getState().second.sampleId === null) showInPane('second', info.id)
        moveEdited(from, working(edited, id), edit)
        showInPane(edited, id)
      }
      notify('info', `Added "${name}" to the library`)
      if (clipping) notify('warning', clipping)
      return
    }

    const merged = project.samples.find((sample) => sample.id === id)
    const origin = merged ? originOf(merged) : originOf(info)
    const remap = sampleRemap(edit, frameCount(source.audio), frames)
    // The panes' working copies move first, so following the sample to its new id finds them and decodes nothing.
    for (const into of showing) {
      if (into === edited) moveEdited(from, working(into, origin), edit)
      else moveAlong(info, working(into, origin), remap)
    }
    const report = useProjectStore.getState().replaceSample(info.id, result, remap)
    // A second pane without a sample of its own follows the first.
    for (const into of showing) if (into === 'main' || useWavePanesStore.getState().second.sampleId !== null) showInPane(into, id)
    if (report.merged) notify('info', `Already in the library as "${report.merged.name}"; its uses now point there.`)
    if (report.emptiedTrims > 0) {
      const count = report.emptiedTrims
      notify('warning', `${count} ${count === 1 ? 'clip was' : 'clips were'} trimmed to audio the edit removed.`)
    }
    if (clipping) notify('warning', clipping)
  }

  const editSample = async (sampleId: string, edit: SampleEdit, asCopy: boolean, pane: WavePane) => {
    const busy = useWaveAudioStore.getState()
    if (busy.editing !== null) return
    const info = useProjectStore.getState().project.samples.find((sample) => sample.id === sampleId)
    if (!info) return
    busy.setEditing(sampleId)
    try {
      await runEdit(info, edit, asCopy, pane)
    } catch (error) {
      notify('error', `The edit failed: ${describe(error)}`)
    } finally {
      useWaveAudioStore.getState().setEditing(null)
    }
  }

  /**
   * *Revert to original* (see `SampleLibrary.revertSample`): read the origin's bytes, decode them, give the engine the
   * audio, then `replaceSample` onto the original through `revertRemap`, if the sample is still in the project.
   */
  const runRevert = async (info: SampleInfo, pane: WavePane) => {
    const original = originalInfo(info)
    if (!original) return
    const bytes = await storage.get(bytesKeyOf(original))
    if (!bytes) {
      notify('error', `The original of "${info.name}" is missing; import the file again.`)
      return
    }
    const { audio } = await decodeAudio(bytes)
    if (!inEngine.has(original.id)) deliver(original.id, { audio: copyAudio(audio) })
    if (!useProjectStore.getState().project.samples.some((sample) => sample.id === info.id)) {
      notify('warning', `"${info.name}" left the project while it was being reverted; the revert was dropped.`)
      return
    }
    const frames = frameCount(audio)
    const remap = revertRemap(info, frames)!
    const showing = panesShowing(info.id)
    const pyramid = showing.length > 0 ? buildPeakPyramid(audio) : null
    for (const into of showing) {
      // The view is the origin's already.
      const key = waveViewKey(into, originOf(info))
      const to: WaveAudio = { sampleId: original.id, pane: into, viewKey: key, audio, pyramid: pyramid! }
      if (into !== pane) {
        moveAlong(info, to, remap)
        continue
      }
      // In the pane it was asked from, the cursor goes where it was in the original, and the selection goes.
      useWaveAudioStore.getState().setPane(into, to)
      const store = useWaveEditorStore.getState()
      store.select(key, null)
      store.setView(key, { cursor: Math.max(0, Math.min(frames, Math.round(remap.start(waveViewOf(store.views, key).cursor)))) })
      clampView(key, frames)
    }
    const report = useProjectStore.getState().replaceSample(info.id, original, remap)
    for (const into of showing) if (into === 'main' || useWavePanesStore.getState().second.sampleId !== null) showInPane(into, original.id)
    if (report.merged) notify('info', `Already in the library as "${report.merged.name}"; its uses now point there.`)
  }

  const revertSample = async (sampleId: string, pane: WavePane) => {
    const busy = useWaveAudioStore.getState()
    if (busy.editing !== null) return
    const info = useProjectStore.getState().project.samples.find((sample) => sample.id === sampleId)
    if (!info) return
    busy.setEditing(sampleId)
    try {
      await runRevert(info, pane)
    } catch (error) {
      notify('error', `The revert failed: ${describe(error)}`)
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

    editSample: (sampleId, edit, { asCopy, pane }) => editSample(sampleId, edit, asCopy, pane),
    revertSample,

    connect: () => {
      loadPresent()
      keepAlive()
      openPanes()
      const unsubscribeProject = useProjectStore.subscribe((state, previous) => {
        if (state.history === previous.history) return
        if (state.project.samples !== previous.project.samples) loadPresent()
        keepAlive()
        if (state.project.samples === previous.project.samples) return
        follow(previous.project.samples)
        openPanes()
      })
      // A working copy no pane holds any more is kept for a while.
      const unsubscribeWave = useWaveAudioStore.subscribe((state, previous) => {
        if (state.panes === previous.panes) return
        for (const pane of WAVE_PANES) {
          const was = previous.panes[pane]
          if (was && !WAVE_PANES.some((other) => state.panes[other]?.sampleId === was.sampleId)) copies.put(was)
        }
      })
      const unsubscribeSelection = useSelectionStore.subscribe((state, previous) => {
        if (state.sampleId !== previous.sampleId) openPanes()
      })
      const unsubscribePanes = useWavePanesStore.subscribe((state, previous) => {
        if (state.second.open !== previous.second.open || state.second.sampleId !== previous.second.sampleId) openPanes()
      })
      return () => {
        unsubscribeProject()
        unsubscribeSelection()
        unsubscribeWave()
        unsubscribePanes()
      }
    },
  }
}
