import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type SampleInfo, createEmptyProject, encodeWavChannels } from '@core'
import { useProjectStore } from '@state'
import { createMemorySampleStorage, sha256Hex } from '@storage'
import type { AudioHost } from '@audio'
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

vi.mock('@audio', () => ({ decodeAudio: async (bytes: Uint8Array) => readWav(bytes) }))

const host = { send: vi.fn() } as unknown as AudioHost
const LEFT = Float32Array.from({ length: 480 }, (_, i) => Math.sin(i / 7) * 0.5 + 1e-7 * i)
const RIGHT = Float32Array.from({ length: 480 }, (_, i) => Math.cos(i / 11) * 0.25)

/** A stereo 32-bit float file in storage and the project. */
const setup = async () => {
  const storage = createMemorySampleStorage()
  const bytes = encodeWavChannels([LEFT, RIGHT], 48000, 32)
  const id = await sha256Hex(bytes)
  await storage.put(id, bytes)
  const info: SampleInfo = { id, name: 'Loop', extension: 'wav', durationSeconds: 0.01, sampleRate: 48000, channels: 2, bytes: bytes.length }
  useProjectStore.getState().resetProject({ ...createEmptyProject(), samples: [info] })
  return { storage, info, library: createSampleLibrary(storage, host) }
}

beforeEach(() => useProjectStore.getState().resetProject(createEmptyProject()))

describe('editing a sample as a copy', () => {
  it('adds a new library entry with both channels, stored as 32-bit float that decodes to the same floats', async () => {
    const { storage, info, library } = await setup()
    await library.editSample(info.id, { kind: 'reverse' }, { asCopy: true })

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
    await library.editSample(info.id, { kind: 'keep', range: { from: 100, to: 200 } }, { asCopy: true })
    expect(useProjectStore.getState().project.samples.map((sample) => sample.durationSeconds)).toEqual([0.01, 100 / 48000])
    useProjectStore.getState().undo()
    expect(useProjectStore.getState().project.samples).toEqual([info])
  })

  it('refuses an edit that leaves nothing, and gives the same copy for the same edit', async () => {
    const { info, library } = await setup()
    await library.editSample(info.id, { kind: 'delete', range: { from: 0, to: 480 } }, { asCopy: true })
    expect(useProjectStore.getState().project.samples).toHaveLength(1)
    await library.editSample(info.id, { kind: 'normalize' }, { asCopy: true })
    await library.editSample(info.id, { kind: 'normalize' }, { asCopy: true })
    expect(useProjectStore.getState().project.samples).toHaveLength(2)
  })
})
