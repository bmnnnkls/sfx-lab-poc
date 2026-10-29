import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type SampleEdit, type SampleInfo, createAudioClip, decodedBytes, createAudioTrack, createEmptyProject, encodeWavChannels, originOf } from '@core'
import { audioClipboard, copyWaveSelection, usePersistenceStore, useProjectStore, useSelectionStore, useWaveAudioStore, useWaveEditorStore, waveViewOf } from '@state'
import { type SampleStorage, StorageFullError, createMemorySampleEditLog, createMemorySampleStorage, sha256Hex } from '@storage'
import { type AudioHost, decodeAudio } from '@audio'
import { ENGINE_KEEP_ALIVE_BYTES, ROOM_FACTOR, WORKING_COPY_CACHE_BYTES } from './sample-budgets'
import { createSampleLibrary } from './sample-library'

/** The browser decodes with Web Audio; here a WAV reader for the two formats these tests write stands in. */
const readWav = (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let format = 0, channelCount = 0, sampleRate = 0, bits = 0, at = 12
  while (at + 8 <= bytes.length) {
    const id = String.fromCharCode(...bytes.subarray(at, at + 4)), size = view.getUint32(at + 4, true)
    if (id === 'fmt ') { format = view.getUint16(at + 8, true); channelCount = view.getUint16(at + 10, true); sampleRate = view.getUint32(at + 12, true); bits = view.getUint16(at + 22, true) }
    if (id === 'data') {
      const frames = size / (channelCount * (bits / 8))
      const channels = Array.from({ length: channelCount }, () => new Float32Array(frames))
      for (let frame = 0; frame < frames; frame++) for (let c = 0; c < channelCount; c++) {
        const offset = at + 8 + (frame * channelCount + c) * (bits / 8)
        channels[c]![frame] = format === 3 ? view.getFloat32(offset, true) : view.getInt16(offset, true) / 32768
      }
      return { audio: { sampleRate, channels }, channels: channelCount, durationSeconds: frames / sampleRate }
    }
    at += 8 + size + (size % 2)
  }
  throw new Error('No data chunk')
}

vi.mock('@audio', () => ({ decodeAudio: vi.fn(async (bytes: Uint8Array) => readWav(bytes)) }))

const host = { send: vi.fn() } as unknown as AudioHost
const WHOLE = { range: { from: 0, to: 480 }, channels: 'both' } as const
const REVERSE: SampleEdit = { kind: 'reverse', ...WHOLE }
const NORMALIZE: SampleEdit = { kind: 'normalize', ...WHOLE, peakDb: -0.1, linked: true }
const LEFT = Float32Array.from({ length: 480 }, (_, i) => Math.sin(i / 7) * 0.5 + 1e-7 * i)
const RIGHT = Float32Array.from({ length: 480 }, (_, i) => Math.cos(i / 11) * 0.25)

/** A stereo 32-bit float file in storage. */
const stored = async (storage: SampleStorage, channels: Float32Array[], name = 'Loop'): Promise<SampleInfo> => {
  const bytes = encodeWavChannels(channels, 48000, 32)
  const id = await sha256Hex(bytes)
  await storage.put(id, bytes)
  return { id, name, extension: 'wav', durationSeconds: channels[0]!.length / 48000, sampleRate: 48000, channels: channels.length, bytes: bytes.length }
}

/** A stereo 32-bit float file in storage and the project. */
const setup = async (options: Parameters<typeof createSampleLibrary>[2] = {}) => {
  const storage = createMemorySampleStorage()
  const info = await stored(storage, [LEFT, RIGHT])
  useProjectStore.getState().resetProject({ ...createEmptyProject(), samples: [info] })
  const edits = createMemorySampleEditLog()
  return { storage, info, edits, library: createSampleLibrary(storage, host, { edits, ...options }) }
}

const samples = () => useProjectStore.getState().project.samples
const lastNotice = () => usePersistenceStore.getState().notices.at(-1)?.message

beforeEach(() => {
  useProjectStore.getState().resetProject(createEmptyProject())
  useSelectionStore.getState().selectSample(null)
  useWaveAudioStore.getState().setCurrent(null)
  useWaveAudioStore.getState().setEditing(null)
  vi.mocked(host.send).mockClear()
})

/** Resolves once the working copy has settled. */
const settled = () => new Promise<void>((resolve) => {
  const check = () => (useWaveAudioStore.getState().loading === null ? resolve() : setTimeout(check, 1))
  check()
})

describe('editing a sample as a copy', () => {
  it('adds a new library entry with both channels, stored as 32-bit float that decodes to the same floats', async () => {
    const { storage, info, library } = await setup()
    await library.editSample(info.id, REVERSE, { asCopy: true })

    const samples = useProjectStore.getState().project.samples
    expect(samples).toHaveLength(2)
    const copy = samples[1]!
    expect(copy).toMatchObject({ name: 'Loop (reversed)', extension: 'wav', channels: 2, sampleRate: 48000, durationSeconds: 0.01 })
    const stored = (await storage.get(copy.id))!
    expect(copy.id).toBe(await sha256Hex(stored))
    expect(copy.bytes).toBe(stored.length)
    const decoded = readWav(stored)
    expect(decoded.audio.channels.map((channel) => Array.from(channel))).toEqual([Array.from(LEFT).reverse(), Array.from(RIGHT).reverse()])
  })

  it('is undone like any project edit, leaving the original as it was', async () => {
    const { info, library } = await setup()
    await library.editSample(info.id, { kind: 'delete', range: { from: 100, to: 480 }, crossfade: { frames: 0, curve: 'linear' } }, { asCopy: true })
    expect(useProjectStore.getState().project.samples.map((sample) => sample.durationSeconds)).toEqual([0.01, 100 / 48000])
    useProjectStore.getState().undo()
    expect(useProjectStore.getState().project.samples).toEqual([info])
  })

  it('refuses an edit that leaves nothing, and gives the same copy for the same edit', async () => {
    const { info, library } = await setup()
    await library.editSample(info.id, { kind: 'delete', range: { from: 0, to: 480 }, crossfade: { frames: 0, curve: 'linear' } }, { asCopy: true })
    expect(useProjectStore.getState().project.samples).toHaveLength(1)
    await library.editSample(info.id, NORMALIZE, { asCopy: true })
    await library.editSample(info.id, NORMALIZE, { asCopy: true })
    expect(useProjectStore.getState().project.samples).toHaveLength(2)
  })
})

describe('the working copy', () => {
  it('is decoded with its pyramid when the editor opens a sample, and dropped when it closes or the sample leaves', async () => {
    const { info, library } = await setup()
    const disconnect = library.connect()
    useSelectionStore.getState().selectSample(info.id)
    await settled()
    const current = useWaveAudioStore.getState().current
    expect(current?.sampleId).toBe(info.id)
    expect(current?.audio.channels.map((channel) => Array.from(channel))).toEqual([Array.from(LEFT), Array.from(RIGHT)])
    expect(current?.pyramid.frames).toBe(480)

    useSelectionStore.getState().selectSample(null)
    await settled()
    expect(useWaveAudioStore.getState().current).toBeNull()

    useSelectionStore.getState().selectSample(info.id)
    await settled()
    useProjectStore.getState().resetProject(createEmptyProject())
    await settled()
    expect(useWaveAudioStore.getState().current).toBeNull()
    disconnect()
  })

  it('is what an edit of the open sample reads, without the stored bytes', async () => {
    const { storage, info, library } = await setup()
    const disconnect = library.connect()
    useSelectionStore.getState().selectSample(info.id)
    await settled()
    await storage.delete(info.id)
    await library.editSample(info.id, REVERSE, { asCopy: true })
    expect(useProjectStore.getState().project.samples.map((sample) => sample.name)).toEqual(['Loop', 'Loop (reversed)'])
    disconnect()
  })
})

describe('editing a sample in place', () => {
  it('stores and notes the bytes and gives the engine the audio before the project points at them', async () => {
    const { storage, info, edits, library } = await setup({ now: () => 1234 })
    const seen: Array<{ stored: boolean; noted: boolean; sent: boolean }> = []
    const unsubscribe = useProjectStore.subscribe((state) => {
      const id = state.project.samples[0]!.id
      const sent = vi.mocked(host.send).mock.calls.some(([command]) => command.type === 'sample/add' && command.sample.id === id)
      void Promise.all([storage.has(id), edits.list()]).then(([has, notes]) => seen.push({ stored: has, noted: notes.some((note) => note.id === id && note.at === 1234), sent }))
    })
    await library.editSample(info.id, REVERSE, { asCopy: false })
    unsubscribe()
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(seen).toEqual([{ stored: true, noted: true, sent: true }])
    expect(samples()).toHaveLength(1)
    expect(samples()[0]).toMatchObject({ name: 'Loop', origin: info.id, channels: 2 })
  })

  it('sends the engine a copy, so the main thread keeps the audio', async () => {
    const { info, library } = await setup()
    const disconnect = library.connect()
    useSelectionStore.getState().selectSample(info.id)
    await settled()
    await library.editSample(info.id, REVERSE, { asCopy: false })
    const sent = vi.mocked(host.send).mock.calls.find(([command]) => command.type === 'sample/add' && command.sample.id === samples()[0]!.id)!
    const working = useWaveAudioStore.getState().current!
    expect(sent[0].type === 'sample/add' && sent[0].sample.channels[0]).not.toBe(working.audio.channels[0])
    expect(Array.from(working.audio.channels[0]!)).toEqual(Array.from(LEFT).reverse())
    disconnect()
  })

  it('is one undo step, and undo and redo move the editor and keep its view', async () => {
    const { info, library } = await setup()
    const disconnect = library.connect()
    useSelectionStore.getState().selectSample(info.id)
    await settled()
    useWaveEditorStore.getState().select(originOf(info), { from: 10, to: 20, channels: 'left' })
    useWaveEditorStore.getState().setView(originOf(info), { framesPerPixel: 2, startFrame: 4 })
    const past = useProjectStore.getState().history.past.length

    await library.editSample(info.id, REVERSE, { asCopy: false })
    const edited = samples()[0]!
    expect(useProjectStore.getState().history.past.length).toBe(past + 1)
    expect(useSelectionStore.getState().sampleId).toBe(edited.id)
    expect(useWaveAudioStore.getState().current?.sampleId).toBe(edited.id)

    useProjectStore.getState().undo()
    expect(samples()).toEqual([info])
    expect(useSelectionStore.getState().sampleId).toBe(info.id)
    await settled()
    expect(useWaveAudioStore.getState().current?.sampleId).toBe(info.id)

    useProjectStore.getState().redo()
    expect(useSelectionStore.getState().sampleId).toBe(edited.id)
    const view = waveViewOf(useWaveEditorStore.getState().views, originOf(edited))
    expect(view).toMatchObject({ framesPerPixel: 2, startFrame: 4, selection: { from: 10, to: 20, channels: 'left' } })
    disconnect()
  })

  it('leaves the cursor at the join after a delete, with nothing selected, and clamps a view past the new end', async () => {
    const { info, library } = await setup()
    const disconnect = library.connect()
    useSelectionStore.getState().selectSample(info.id)
    await settled()
    useWaveEditorStore.getState().select(originOf(info), { from: 100, to: 300, channels: 'both' })
    await library.editSample(info.id, { kind: 'delete', range: { from: 100, to: 300 }, crossfade: { frames: 0, curve: 'linear' } }, { asCopy: false })
    expect(waveViewOf(useWaveEditorStore.getState().views, originOf(info))).toMatchObject({ selection: null, cursor: 100 })
    useWaveEditorStore.getState().select(originOf(info), { from: 200, to: 280, channels: 'both' })
    useProjectStore.getState().undo()
    useProjectStore.getState().redo()
    expect(waveViewOf(useWaveEditorStore.getState().views, originOf(info)).selection).toMatchObject({ from: 200, to: 280 })
    disconnect()
  })

  it.each([
    { name: 'too little room', options: { freeBytes: async () => 1000 }, message: /Not enough browser storage/ },
    {
      name: 'a quota error',
      storage: (inner: SampleStorage): SampleStorage => ({ ...inner, put: async () => { throw new StorageFullError() } }),
      message: /storage is full/,
    },
  ])('refuses the edit on $name and leaves the project and its history as they were', async ({ options, storage, message }) => {
    const memory = createMemorySampleStorage()
    const info = await stored(memory, [LEFT, RIGHT])
    useProjectStore.getState().resetProject({ ...createEmptyProject(), samples: [info] })
    const edits = createMemorySampleEditLog()
    const library = createSampleLibrary(storage ? storage(memory) : memory, host, { edits, ...options })
    const before = useProjectStore.getState().history
    await library.editSample(info.id, REVERSE, { asCopy: false })
    expect(useProjectStore.getState().history).toBe(before)
    expect(await edits.list()).toEqual([])
    expect(lastNotice()).toMatch(message)
    expect(vi.mocked(host.send).mock.calls.filter(([command]) => command.type === 'sample/add')).toEqual([])
  })

  it('checks for twice the file in free room', async () => {
    const wav = encodeWavChannels([LEFT, RIGHT], 48000, 32).length
    const { info, library } = await setup({ freeBytes: async () => ROOM_FACTOR * wav })
    await library.editSample(info.id, REVERSE, { asCopy: false })
    expect(samples()[0]!.id).not.toBe(info.id)
  })

  it('drops an edit whose sample left the project meanwhile, and leaves its file to cleanup', async () => {
    const { info, edits, library } = await setup({
      freeBytes: async () => {
        useProjectStore.getState().removeSample(info.id)
        return null
      },
    })
    await library.editSample(info.id, REVERSE, { asCopy: false })
    expect(samples()).toEqual([])
    expect(lastNotice()).toMatch(/left the project/)
    expect(await edits.list()).toHaveLength(1)
  })

  it('says "Nothing changed" for an edit that gives the same file', async () => {
    const storage = createMemorySampleStorage()
    const silent = await stored(storage, [new Float32Array(480)])
    useProjectStore.getState().resetProject({ ...createEmptyProject(), samples: [silent] })
    const before = useProjectStore.getState().history
    await createSampleLibrary(storage, host).editSample(silent.id, NORMALIZE, { asCopy: false })
    expect(useProjectStore.getState().history).toBe(before)
    expect(lastNotice()).toBe('Nothing changed')
  })

  it('points the uses at a library entry the result already is', async () => {
    const storage = createMemorySampleStorage()
    const original = await stored(storage, [LEFT, RIGHT])
    const reversed = await stored(storage, [LEFT.slice().reverse(), RIGHT.slice().reverse()], 'Backwards')
    const track = { ...createAudioTrack('Audio', 4), clips: [createAudioClip(original, 120), null, null, null] }
    useProjectStore.getState().resetProject({ ...createEmptyProject(), samples: [original, reversed], tracks: [track] })
    await createSampleLibrary(storage, host).editSample(original.id, REVERSE, { asCopy: false })
    expect(samples()).toEqual([reversed])
    const clip = useProjectStore.getState().project.tracks[0]!
    expect(clip.kind === 'audio' && clip.clips[0]?.sampleId).toBe(reversed.id)
    expect(lastNotice()).toBe('Already in the library as "Backwards"; its uses now point there.')
  })

  it('runs one edit at a time: one asked for meanwhile is refused', async () => {
    const { info, library } = await setup()
    const first = library.editSample(info.id, REVERSE, { asCopy: false })
    expect(useWaveAudioStore.getState().editing).toBe(info.id)
    await library.editSample(info.id, NORMALIZE, { asCopy: false })
    await first
    expect(useWaveAudioStore.getState().editing).toBeNull()
    expect(useProjectStore.getState().history.past).toHaveLength(1)
  })

  it('with asCopy adds a copy and opens it in the editor', async () => {
    const { info, library } = await setup()
    const disconnect = library.connect()
    useSelectionStore.getState().selectSample(info.id)
    await settled()
    await library.editSample(info.id, REVERSE, { asCopy: true })
    expect(samples().map((sample) => sample.name)).toEqual(['Loop', 'Loop (reversed)'])
    expect(samples()[1]!.origin).toBeUndefined()
    expect(useSelectionStore.getState().sampleId).toBe(samples()[1]!.id)
    expect(useWaveAudioStore.getState().current?.sampleId).toBe(samples()[1]!.id)
    disconnect()
  })

  it('forgets the note when the same bytes are imported, so imports are never cleaned up', async () => {
    const { info, edits, library } = await setup()
    await library.editSample(info.id, REVERSE, { asCopy: false })
    const edited = samples()[0]!
    expect((await edits.list()).map((note) => note.id)).toEqual([edited.id])
    const bytes = encodeWavChannels([LEFT.slice().reverse(), RIGHT.slice().reverse()], 48000, 32)
    await library.importFiles([new File([bytes as Uint8Array<ArrayBuffer>], 'Again.wav')])
    expect(await edits.list()).toEqual([])
  })
})

describe('undo and memory', () => {
  const removed = () => vi.mocked(host.send).mock.calls.flatMap(([command]) => (command.type === 'sample/remove' ? [command.sampleId] : []))
  const decodes = () => vi.mocked(decodeAudio).mock.calls.length

  it('keeps 128 MB of decoded audio on each side by default', () => {
    expect([WORKING_COPY_CACHE_BYTES, ENGINE_KEEP_ALIVE_BYTES]).toEqual([128 * 1024 * 1024, 128 * 1024 * 1024])
  })

  it('undoes and redoes an edit inside the budgets with no sample/remove and nothing decoded', async () => {
    const { info, library } = await setup()
    const disconnect = library.connect()
    useSelectionStore.getState().selectSample(info.id)
    await settled()
    await library.editSample(info.id, REVERSE, { asCopy: false })
    vi.mocked(host.send).mockClear()
    const before = decodes()
    for (let round = 0; round < 2; round++) {
      useProjectStore.getState().undo()
      await settled()
      expect(useWaveAudioStore.getState().current?.sampleId).toBe(info.id)
      useProjectStore.getState().redo()
      await settled()
    }
    expect(removed()).toEqual([])
    expect(decodes()).toBe(before)
    expect(vi.mocked(host.send).mock.calls.filter(([command]) => command.type === 'sample/add')).toEqual([])
    disconnect()
  })

  it('past the budget lets the first sample to leave go first, and undo decodes it again', async () => {
    const one = decodedBytes({ sampleRate: 48000, channels: [LEFT, RIGHT] })
    const { info, library } = await setup({ budgets: { keepAlive: one } })
    const disconnect = library.connect()
    await library.editSample(info.id, REVERSE, { asCopy: false })
    const reversed = samples()[0]!
    expect(removed()).toEqual([])
    await library.editSample(reversed.id, NORMALIZE, { asCopy: false })
    expect(removed()).toEqual([info.id])

    const before = decodes()
    useProjectStore.getState().undo()
    expect(decodes()).toBe(before)
    useProjectStore.getState().undo()
    await vi.waitFor(() => expect(decodes()).toBe(before + 1))
    disconnect()
  })

  it('lets go of what only the redo future named once a new step drops it', async () => {
    const { info, library } = await setup()
    const disconnect = library.connect()
    await library.editSample(info.id, REVERSE, { asCopy: false })
    const reversed = samples()[0]!
    useProjectStore.getState().undo()
    expect(removed()).toEqual([])
    useProjectStore.getState().setName('Another step')
    expect(removed()).toEqual([reversed.id])
    disconnect()
  })

  it('undoes removing a sample with nothing decoded', async () => {
    const { info, library } = await setup()
    const disconnect = library.connect()
    await vi.waitFor(() => expect(vi.mocked(host.send).mock.calls.some(([command]) => command.type === 'sample/add')).toBe(true))
    const before = decodes()
    useProjectStore.getState().removeSample(info.id)
    expect(removed()).toEqual([])
    useProjectStore.getState().undo()
    await Promise.resolve()
    expect(decodes()).toBe(before)
    expect(samples()).toEqual([info])
    disconnect()
  })

  it('reopens a sample from the working copies, without decoding', async () => {
    const storage = createMemorySampleStorage()
    const first = await stored(storage, [LEFT, RIGHT])
    const second = await stored(storage, [RIGHT], 'Other')
    useProjectStore.getState().resetProject({ ...createEmptyProject(), samples: [first, second] })
    const library = createSampleLibrary(storage, host)
    const disconnect = library.connect()
    useSelectionStore.getState().selectSample(first.id)
    await settled()
    useSelectionStore.getState().selectSample(second.id)
    await settled()
    const before = decodes()
    useSelectionStore.getState().selectSample(first.id)
    await settled()
    expect(useWaveAudioStore.getState().current?.sampleId).toBe(first.id)
    expect(decodes()).toBe(before)
    disconnect()
  })
})

describe('the audio clipboard', () => {
  it('copies one channel of a stereo selection alone, with handles', async () => {
    const { info, library } = await setup()
    const disconnect = library.connect()
    useSelectionStore.getState().selectSample(info.id)
    await settled()
    copyWaveSelection(useWaveAudioStore.getState().current!, { from: 100, to: 200, channels: 'right' })
    const copy = audioClipboard.get()!
    expect(copy.audio.channels.map((channel) => Array.from(channel))).toEqual([Array.from(RIGHT.subarray(100, 200))])
    expect(copy.handles.before.channels[0]).toHaveLength(100)
    disconnect()
  })

  it('cuts as a copy and one undo step, and pastes back at the cursor to the same length', async () => {
    const { info, library } = await setup()
    const disconnect = library.connect()
    useSelectionStore.getState().selectSample(info.id)
    await settled()
    const butt = { frames: 0, curve: 'linear' } as const
    const past = useProjectStore.getState().history.past.length
    copyWaveSelection(useWaveAudioStore.getState().current!, { from: 100, to: 200, channels: 'both' })
    await library.editSample(info.id, { kind: 'delete', range: { from: 100, to: 200 }, crossfade: butt }, { asCopy: false })
    expect(useProjectStore.getState().history.past.length).toBe(past + 1)
    expect(samples()[0]!.durationSeconds).toBeCloseTo(380 / 48000, 12)

    const cut = samples()[0]!
    await library.editSample(cut.id, { kind: 'replace', range: { from: 100, to: 100 }, insert: audioClipboard.get()!, crossfade: butt }, { asCopy: false })
    // Pasted back where it was cut with butt splices: the original file, so the original entry.
    expect(samples()[0]!.id).toBe(info.id)
    expect(waveViewOf(useWaveEditorStore.getState().views, originOf(info)).selection).toMatchObject({ from: 100, to: 200 })
    useProjectStore.getState().undo()
    useProjectStore.getState().undo()
    expect(samples()).toEqual([info])
    expect(audioClipboard.get()).not.toBeNull()
    disconnect()
  })
})
