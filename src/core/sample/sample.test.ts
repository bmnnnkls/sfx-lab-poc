import { describe, expect, it } from 'vitest'
import { SampleBank, computePeaks, createDemoSamples, encodeWav, encodeWavChannels, toMono } from '.'

describe('toMono', () => {
  it('averages channels and copies a single channel', () => {
    expect(Array.from(toMono([Float32Array.of(1, 0), Float32Array.of(0, 1)]))).toEqual([0.5, 0.5])
    const single = Float32Array.of(0.25, -0.25)
    const copy = toMono([single])
    expect(Array.from(copy)).toEqual([0.25, -0.25])
    expect(copy).not.toBe(single)
    expect(toMono([]).length).toBe(0)
  })
})

describe('computePeaks', () => {
  it('reports the loudest sample in each bucket', () => {
    const peaks = computePeaks(Float32Array.of(0.1, -0.5, 0.2, 0.9, -0.3, 0), 3)
    expect(Array.from(peaks).map((v) => +v.toFixed(2))).toEqual([0.5, 0.9, 0.3])
  })

  it('handles empty data and more buckets than samples', () => {
    expect(computePeaks(new Float32Array(0), 4)).toHaveLength(4)
    expect(computePeaks(Float32Array.of(0.5), 4)).toHaveLength(4)
  })
})

describe('encodeWav', () => {
  it('writes a valid 16-bit mono PCM header and clamps samples', () => {
    const bytes = encodeWav(Float32Array.of(0, 1, -1, 2), 22050)
    const view = new DataView(bytes.buffer)
    const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4))

    expect([tag(0), tag(8), tag(12), tag(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data'])
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(22050)
    expect(view.getUint32(40, true)).toBe(8)
    expect([view.getInt16(44, true), view.getInt16(46, true), view.getInt16(48, true), view.getInt16(50, true)]).toEqual([
      0, 32767, -32767, 32767,
    ])
  })
})

/** A small WAV reader for the tests: the header fields and the samples of each channel, as a player would read them. */
const readWav = (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4))
  const chunks: Record<string, { at: number; size: number }> = {}
  for (let at = 12; at + 8 <= bytes.length; ) {
    const size = view.getUint32(at + 4, true)
    chunks[tag(at)] = { at: at + 8, size }
    at += 8 + size + (size % 2)
  }
  const fmt = chunks['fmt ']!.at
  const header = {
    riff: tag(0),
    wave: tag(8),
    riffSize: view.getUint32(4, true),
    format: view.getUint16(fmt, true),
    channels: view.getUint16(fmt + 2, true),
    sampleRate: view.getUint32(fmt + 4, true),
    byteRate: view.getUint32(fmt + 8, true),
    blockAlign: view.getUint16(fmt + 12, true),
    bits: view.getUint16(fmt + 14, true),
    dataSize: chunks.data!.size,
    fact: chunks.fact ? view.getUint32(chunks.fact.at, true) : undefined,
    chunks: Object.keys(chunks),
  }
  const frames = header.dataSize / header.blockAlign
  const channels = Array.from({ length: header.channels }, () => new Float32Array(frames))
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < header.channels; c++) {
      const at = chunks.data!.at + i * header.blockAlign + (c * header.bits) / 8
      channels[c]![i] = header.bits === 32 ? view.getFloat32(at, true) : view.getInt16(at, true) / 32767
    }
  }
  return { header, channels, length: bytes.length }
}

describe('encodeWavChannels', () => {
  const left = Float32Array.of(0, 0.5, -0.5, 1, -1, 0.25)
  const right = Float32Array.of(0.1, -0.1, 0.2, -0.2, 0, 0.75)

  it('writes a 16-bit stereo PCM file: RIFF, fmt and data sizes, two channels, the rate', () => {
    const wav = readWav(encodeWavChannels([left, right], 44100, 16))
    expect(wav.header).toMatchObject({
      riff: 'RIFF', wave: 'WAVE', format: 1, channels: 2, sampleRate: 44100, byteRate: 44100 * 4, blockAlign: 4, bits: 16, dataSize: 6 * 4,
    })
    expect(wav.header.chunks).toEqual(['fmt ', 'data'])
    expect(wav.length).toBe(44 + 24)
    expect(wav.header.riffSize).toBe(wav.length - 8)
  })

  it('round-trips within a 16-bit step, with the channels kept apart and out-of-range values clamped', () => {
    const { channels } = readWav(encodeWavChannels([left, Float32Array.of(...right).map((v, i) => (i === 3 ? 3 : v))], 48000, 16))
    left.forEach((value, i) => expect(channels[0]![i]).toBeCloseTo(value, 4))
    right.forEach((value, i) => expect(channels[1]![i]).toBeCloseTo(i === 3 ? 1 : value, 4))
  })

  it('writes 32-bit float exactly, with the fact chunk the format asks for', () => {
    const loud = Float32Array.of(1.5, -2, 1e-7, 0.123456789)
    const wav = readWav(encodeWavChannels([loud, loud], 48000, 32))
    expect(wav.header).toMatchObject({ format: 3, channels: 2, sampleRate: 48000, bits: 32, blockAlign: 8, byteRate: 48000 * 8, dataSize: 4 * 8, fact: 4 })
    expect(wav.header.chunks).toEqual(['fmt ', 'fact', 'data'])
    expect(wav.header.riffSize).toBe(wav.length - 8)
    expect(Array.from(wav.channels[0]!)).toEqual(Array.from(loud))
    expect(Array.from(wav.channels[1]!)).toEqual(Array.from(loud))
  })

  it('one channel is the mono file encodeWav writes, to the byte', () => {
    const mono = Float32Array.of(0, 0.5, -0.5, 1, -1, 0.25, 0.1, 0.2)
    expect(Array.from(encodeWavChannels([mono], 22050, 16))).toEqual(Array.from(encodeWav(mono, 22050)))
  })

  it('pads a chunk of odd size, and an empty file is a header', () => {
    const odd = encodeWavChannels([Float32Array.of(0.5, -0.5, 0.25)], 8000, 16)
    expect(odd.length % 2).toBe(0)
    expect(readWav(odd).header.dataSize).toBe(6)
    const none = readWav(encodeWavChannels([new Float32Array(0), new Float32Array(0)], 48000, 16))
    expect(none.header.dataSize).toBe(0)
    expect(none.channels[0]).toHaveLength(0)
  })

  it('is the same bytes for the same audio', () => {
    expect(Array.from(encodeWavChannels([left, right], 48000, 16))).toEqual(Array.from(encodeWavChannels([left, right], 48000, 16)))
  })
})

describe('demo samples', () => {
  it('are deterministic, audible and not clipping', () => {
    const first = createDemoSamples()
    const second = createDemoSamples()
    expect(first.map((s) => s.name)).toEqual([
      'Demo Kick', 'Demo Snare', 'Demo Hat', 'Demo Pluck C4', 'Demo Drum Loop 120 BPM',
    ])

    for (const [index, sample] of first.entries()) {
      expect(Array.from(sample.bytes)).toEqual(Array.from(second[index]!.bytes)) // stable ids
      const view = new DataView(sample.bytes.buffer)
      let peak = 0
      for (let at = 44; at < sample.bytes.length; at += 2) peak = Math.max(peak, Math.abs(view.getInt16(at, true)))
      expect(peak / 32767, sample.name).toBeGreaterThan(0.2)
      expect(peak / 32767, sample.name).toBeLessThanOrEqual(1)
    }
  })
})

describe('SampleBank', () => {
  it('stores and removes samples by id', () => {
    const bank = new SampleBank()
    bank.set({ id: 'a', sampleRate: 44100, data: new Float32Array(4) })
    expect(bank.get('a')?.sampleRate).toBe(44100)
    bank.delete('a')
    expect(bank.get('a')).toBeUndefined()
  })
})

describe('demo drum loop', () => {
  const loop = createDemoSamples().find((sample) => sample.name.includes('Loop'))!

  it('is exactly one bar at 120 BPM (4 beats = 2 seconds), so it loops without a seam', () => {
    const view = new DataView(loop.bytes.buffer)
    const sampleRate = view.getUint32(24, true)
    const frames = view.getUint32(40, true) / 2
    expect(frames / sampleRate).toBeCloseTo(2, 3)
  })

  it('names its tempo so an audio clip can work out its length', async () => {
    const { guessLengthBeats } = await import('../project')
    const info = { id: 'x'.repeat(64), name: loop.name, extension: 'wav', durationSeconds: 2, sampleRate: 44100, channels: 1, bytes: 1 }
    expect(guessLengthBeats(info, 77)).toBe(4) // regardless of the project tempo
  })
})
