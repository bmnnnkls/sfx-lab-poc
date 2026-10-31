import { describe, expect, it } from 'vitest'
import { type BandEdit, BAND_EDIT_FFT_SIZE, BAND_FEATHER_OCTAVES, applyBandEdit, applyBandEditTo, bandEditReads } from '.'
import { DEFAULT_CROSSFADE, SAMPLE_EDITS, type SampleAudio, type SampleEditContext, applySampleEdit, changedFrames, remapStep } from '../sample'

const RATE = 48_000
const FRAMES = RATE * 2
const tone = (hz: number, amplitude = 0.5) => Float32Array.from({ length: FRAMES }, (_, i) => amplitude * Math.sin((2 * Math.PI * hz * i) / RATE))
const mono = (...channels: Float32Array[]): SampleAudio => ({ sampleRate: RATE, channels })
const mixed = () => {
  const low = tone(1000)
  const high = tone(5000, 0.25)
  return low.map((value, i) => value + high[i]!)
}
const RANGE = { from: RATE / 2, to: (RATE * 3) / 2 }
const FEATHER = { frames: 240, octaves: BAND_FEATHER_OCTAVES }
const gain = (db: number, band = { low: 500, high: 2000 }, range = RANGE): BandEdit => ({ kind: 'band-gain', range, channels: 'both', band, db, feather: FEATHER })
const keep = (band = { low: 500, high: 2000 }): BandEdit => ({ kind: 'keep-band', range: RANGE, channels: 'both', band, feather: FEATHER })

/** The RMS in dB over the range's middle, away from the edges' feathers and the window's reach. */
const middleDb = (channel: Float32Array) => {
  let sum = 0
  const from = RATE * 0.7
  const to = RATE * 1.3
  for (let i = from; i < to; i++) sum += channel[i]! ** 2
  return 10 * Math.log10(sum / (to - from))
}
const maxDifference = (a: Float32Array, b: Float32Array, from = 0, to = a.length) => {
  let most = 0
  for (let i = from; i < to; i++) most = Math.max(most, Math.abs(a[i]! - b[i]!))
  return most
}
const sameBits = (a: Float32Array, b: Float32Array) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(Buffer.from(b.buffer, b.byteOffset, b.byteLength))

describe('band gain', () => {
  const input = tone(1000)
  const before = middleDb(input)

  it.each([-6, -24, -60, 6, 12])('turns a tone inside the band by %d dB in the range', (db) => {
    const result = applyBandEditTo(mono(input), gain(db)).channels[0]!
    expect(middleDb(result) - before).toBeCloseTo(db, 0)
    expect(Math.abs(middleDb(result) - before - db)).toBeLessThan(0.5)
  })

  it('removes it to under −90 dB', () => {
    const result = applyBandEditTo(mono(input), gain(-Infinity)).channels[0]!
    expect(middleDb(result) - before).toBeLessThan(-90)
  })

  it('leaves a tone outside the band alone', () => {
    const outside = tone(5000)
    expect(maxDifference(applyBandEditTo(mono(outside), gain(-Infinity)).channels[0]!, outside)).toBeLessThan(1e-6)
  })

  it('changes only the band of a mix', () => {
    const input = mixed()
    const result = applyBandEditTo(mono(input), gain(-Infinity)).channels[0]!
    expect(maxDifference(result, tone(5000, 0.25), RATE * 0.7, RATE * 1.3)).toBeLessThan(1e-5)
  })
})

describe('keep band', () => {
  it('keeps the band and removes everything else in the range', () => {
    const input = mixed()
    const result = applyBandEditTo(mono(input), keep()).channels[0]!
    expect(maxDifference(result, tone(1000), RATE * 0.7, RATE * 1.3)).toBeLessThan(1e-5)
    const above = applyBandEditTo(mono(input), keep({ low: 3000, high: 8000 })).channels[0]!
    expect(maxDifference(above, tone(5000, 0.25), RATE * 0.7, RATE * 1.3)).toBeLessThan(1e-5)
  })
})

describe('applyBandEdit', () => {
  const input = mixed()
  const edits: [string, BandEdit][] = [
    ['band gain', gain(-24)],
    ['keep band', keep()],
    ['band gain at the start', gain(-24, { low: 500, high: 2000 }, { from: 0, to: 3000 })],
    ['band gain at the end', gain(-24, { low: 500, high: 2000 }, { from: FRAMES - 3000, to: FRAMES })],
  ]

  it.each(edits)('%s leaves every frame outside the range bit for bit the same', (_, edit) => {
    const result = applyBandEditTo(mono(input), edit).channels[0]!
    const { from, to } = changedFrames(edit, FRAMES)
    expect(sameBits(result.subarray(0, from), input.subarray(0, from))).toBe(true)
    expect(sameBits(result.subarray(to), input.subarray(to))).toBe(true)
    expect(maxDifference(result, input, from, to)).toBeGreaterThan(0.01)
  })

  it('eases in and out at the range’s edges', () => {
    const result = applyBandEditTo(mono(input), gain(-Infinity)).channels[0]!
    // The first frame of the range takes 1/241 of the change.
    expect(Math.abs(result[RANGE.from]! - input[RANGE.from]!)).toBeLessThan(0.01)
    expect(Math.abs(result[RANGE.to - 1]! - input[RANGE.to - 1]!)).toBeLessThan(0.01)
  })

  it('changes nothing at 0 dB, bit for bit', () => {
    expect(sameBits(applyBandEditTo(mono(input), gain(0)).channels[0]!, input)).toBe(true)
  })

  it.each(edits)('%s gives the same floats from a slice at any offset as from the whole sample', (_, edit) => {
    const whole = applyBandEditTo(mono(input), edit).channels[0]!
    const { from, to } = changedFrames(edit, FRAMES)
    const reads = bandEditReads(edit, FRAMES)
    for (const offset of [reads.from, Math.max(0, reads.from - 1), Math.max(0, reads.from - 777), 0]) {
      const slice = { channels: [input.subarray(offset, Math.min(FRAMES, reads.to + 300))], offset, frames: FRAMES, sampleRate: RATE }
      expect(sameBits(applyBandEdit(slice, edit)[0]!, whole.subarray(from, to)), `offset ${offset}`).toBe(true)
    }
  })

  it('gives the same floats every time', () => {
    expect(sameBits(applyBandEditTo(mono(input), keep()).channels[0]!, applyBandEditTo(mono(input), keep()).channels[0]!)).toBe(true)
  })

  it('works on the channels asked for', () => {
    const right = tone(1000)
    const result = applyBandEditTo(mono(input, right), { ...gain(-Infinity), channels: 'right' })
    expect(sameBits(result.channels[0]!, input)).toBe(true)
    expect(middleDb(result.channels[1]!)).toBeLessThan(-90)
  })

  it('reads a window on each side of the range', () => {
    expect(bandEditReads(gain(-6), FRAMES)).toEqual({ from: RANGE.from - BAND_EDIT_FFT_SIZE, to: RANGE.to + BAND_EDIT_FFT_SIZE })
    expect(bandEditReads(gain(-6, { low: 0, high: 100 }, { from: 100, to: FRAMES }), FRAMES)).toEqual({ from: 0, to: FRAMES })
  })
})

describe('the spectral entries', () => {
  const context = (band?: { low: number; high: number }, settings?: Record<string, number>): SampleEditContext => ({
    selection: { from: 1000, to: 5000, channels: 'left', ...(band && { band }) },
    frames: FRAMES,
    sampleRate: RATE,
    channelCount: 2,
    crossfade: DEFAULT_CROSSFADE,
    fadeCurve: 'linear',
    ...(settings && { settings }),
  })

  it('make their edit from the box, and nothing without a band', () => {
    const band = { low: 200, high: 2000 }
    expect(SAMPLE_EDITS['band-gain'].create(context(band))).toEqual({
      kind: 'band-gain',
      range: { from: 1000, to: 5000 },
      channels: 'left',
      band,
      db: -6,
      feather: { frames: 240, octaves: BAND_FEATHER_OCTAVES },
    })
    expect(SAMPLE_EDITS['band-gain'].create(context(band, { db: -100 }))).toMatchObject({ db: -60 })
    expect(SAMPLE_EDITS['band-gain'].create(context(band, { db: -12, remove: 1 }))).toMatchObject({ db: -Infinity })
    expect(SAMPLE_EDITS['keep-band'].create(context(band))).toMatchObject({ kind: 'keep-band', band })
    expect(SAMPLE_EDITS['band-gain'].create(context())).toBeNull()
    expect(SAMPLE_EDITS['keep-band'].create(context())).toBeNull()
  })

  it('are spectral, allow and need a band, move nothing and change the range', () => {
    for (const kind of ['band-gain', 'keep-band'] as const) {
      const entry = SAMPLE_EDITS[kind]
      expect(entry).toMatchObject({ group: 'spectral', allowsBand: true, needsBand: true, channels: 'any' })
      expect(remapStep(gain(-6), FRAMES)).toBeNull()
      expect(entry.after(gain(-6) as never, FRAMES)).toBe('keep')
    }
    expect(changedFrames(gain(-6, undefined, { from: -50, to: FRAMES + 50 }), FRAMES)).toEqual({ from: 0, to: FRAMES })
  })

  it('apply through applySampleEdit', () => {
    const input = mono(tone(1000))
    expect(sameBits(applySampleEdit(input, gain(-24)).channels[0]!, applyBandEditTo(input, gain(-24)).channels[0]!)).toBe(true)
  })

  it('leave every other entry blocked by a band', () => {
    const others = Object.values(SAMPLE_EDITS).filter((entry) => entry.group !== 'spectral')
    expect(others.length).toBeGreaterThan(0)
    for (const entry of others) expect(entry.allowsBand ?? false, entry.kind).toBe(false)
  })
})
