import { describe, expect, it } from 'vitest'
import { SPLIT_WAVE_SHARE, laneParts, partBox } from './lane-renderers'
import { SPECTRUM_COLORS, binRows, colorLookup, frequencyMarks, frequencyY, paintSpectrum } from './spectrogram'

const RATE = 48000
const BINS = 1025

describe('binRows', () => {
  it.each(['log', 'linear'] as const)('covers the bins from the bottom of the scale to the top, rising with the row (%s)', (scale) => {
    for (const height of [60, 120, 400]) {
      const rows = binRows(height, scale, BINS, RATE)
      const covered = new Set<number>()
      for (let y = 0; y < height; y++) {
        expect(rows.to[y]!).toBeGreaterThan(rows.from[y]!)
        if (y > 0) expect(rows.from[y - 1]!).toBeGreaterThanOrEqual(rows.from[y]!)
        for (let bin = rows.from[y]!; bin < rows.to[y]!; bin++) covered.add(bin)
      }
      const lowest = rows.from[height - 1]!
      for (let bin = lowest; bin < BINS; bin++) expect(covered.has(bin), `bin ${bin} at ${height}`).toBe(true)
      expect(rows.to[0]).toBe(BINS)
    }
  })

  it('puts 1 kHz where the scale says', () => {
    const binHz = RATE / 2 / (BINS - 1)
    for (const scale of ['log', 'linear'] as const) {
      const rows = binRows(400, scale, BINS, RATE)
      const y = Math.floor(frequencyY(1000, 400, scale, RATE / 2))
      expect(rows.from[y]! * binHz).toBeLessThanOrEqual(1000 + binHz)
      expect(rows.to[y]! * binHz).toBeGreaterThanOrEqual(1000 - binHz)
    }
  })
})

describe('frequencyMarks', () => {
  it.each(['log', 'linear'] as const)('keeps 24 px between labels (%s)', (scale) => {
    for (const height of [60, 120, 400]) {
      const marks = frequencyMarks(height, scale, RATE / 2)
      for (let i = 1; i < marks.length; i++) expect(marks[i - 1]!.y - marks[i]!.y).toBeGreaterThanOrEqual(24)
      expect(marks.every((mark) => mark.y >= 5 && mark.y <= height)).toBe(true)
    }
  })

  it('labels the log scale at 50, 100, 200, 500, 1k … 20k where there is room, and the linear one in even kHz', () => {
    expect(frequencyMarks(400, 'log', RATE / 2).map((mark) => mark.label)).toEqual(['50', '100', '200', '500', '1k', '2k', '5k', '10k', '20k'])
    expect(frequencyMarks(60, 'log', RATE / 2).length).toBeLessThan(4)
    expect(frequencyMarks(400, 'linear', RATE / 2).map((mark) => mark.label)).toEqual(['2k', '4k', '6k', '8k', '10k', '12k', '14k', '16k', '18k', '20k', '22k'])
  })
})

describe('the colors', () => {
  it('run from the background to white, and the floor and quieter are the first color', () => {
    expect(SPECTRUM_COLORS).toHaveLength(256)
    const lookup = colorLookup(-100)
    const rgb = (word: number) => [word & 255, (word >>> 8) & 255, (word >>> 16) & 255]
    expect(rgb(lookup[0]!)).toEqual([...SPECTRUM_COLORS[0]!])
    // −100 dB is byte 42.5 on the −120 to 0 dB range: everything up to it is the floor.
    expect(lookup[42]).toBe(lookup[0])
    expect(rgb(lookup[255]!)).toEqual([...SPECTRUM_COLORS[255]!])
    expect(lookup[200]).not.toBe(lookup[100])
    expect(lookup[0]! >>> 24).toBe(255)
  })
})

describe('paintSpectrum', () => {
  it('paints each pixel column the loudest of its columns per row, and the floor where it draws nothing', () => {
    const bins = 9
    const data = new Uint8Array(3 * bins)
    data[0 * bins + 8] = 200 // column 0, the top bin
    data[1 * bins + 0] = 100 // column 1, the lowest bin
    data[2 * bins + 0] = 150 // column 2, the lowest bin
    const colors = Uint32Array.from({ length: 256 }, (_, byte) => byte)
    const rows = { from: Int32Array.from([8, 4, 0]), to: Int32Array.from([9, 8, 4]) }
    const pixels = new Uint32Array(3 * 3)
    paintSpectrum(pixels, 3, 3, { kind: 'levels', bins, data, from: Int32Array.from([0, 1, 0]), to: Int32Array.from([1, 3, 0]) }, rows, colors)
    // Rows top to bottom; columns left to right.
    expect([...pixels]).toEqual([200, 0, 0, 0, 0, 0, 0, 150, 0])
    paintSpectrum(pixels, 3, 3, null, rows, colors.map(() => 7))
    expect(pixels.every((pixel) => pixel === 7)).toBe(true)
  })
})

describe('laneParts', () => {
  it('splits a lane into the waveform over the spectrogram, in whole pixels that add up', () => {
    expect(laneParts('waveform').map((part) => part.kind)).toEqual(['waveform'])
    expect(laneParts('spectrogram').map((part) => part.kind)).toEqual(['spectrogram'])
    const [wave, spectrum] = laneParts('split')
    expect(wave!.share).toBe(SPLIT_WAVE_SHARE)
    const top = partBox(wave!, 101)
    const bottom = partBox(spectrum!, 101)
    expect(top.top).toBe(0)
    expect(bottom.top).toBe(top.height)
    expect(top.height + bottom.height).toBe(101)
  })
})
