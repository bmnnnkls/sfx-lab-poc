import { describe, expect, it } from 'vitest'
import { SampleBank, computePeaks, createDemoSamples, encodeWav, toMono } from '.'

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

describe('demo samples', () => {
  it('are deterministic, audible and not clipping', () => {
    const first = createDemoSamples()
    const second = createDemoSamples()
    expect(first.map((s) => s.name)).toEqual(['Demo Kick', 'Demo Snare', 'Demo Hat', 'Demo Pluck C4'])

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
