import { describe, expect, it } from 'vitest'
import { envelopePreview } from './envelope'
import { BOTTOM_DB, TOP_DB, filterPreview, responseDb } from './filter'
import { hasPreview, nodePreview } from './index'
import { lfoPreview } from './lfo'
import { gainPreview, panPreview, widthPreview } from './level'
import { cyclesForFrequency, oscillatorPreview } from './oscillator'
import { delayPreview, reverbPreview } from './space'
import { type Point, type Preview, PREVIEW_HEIGHT, PREVIEW_WIDTH } from './types'
import { wavePoints } from './waves'

const lines = (preview: Preview, tone: 'main' | 'dim' = 'main') =>
  preview.shapes.flatMap((shape) => (shape.kind === 'line' && shape.tone === tone ? [shape.points] : []))
const main = (preview: Preview): readonly Point[] => lines(preview)[0]!
const inside = (preview: Preview) =>
  preview.shapes.every((shape) => {
    const points: readonly Point[] =
      shape.kind === 'line' || shape.kind === 'area' ? shape.points : shape.kind === 'dot' ? [[shape.x, shape.y]] : [[shape.x, shape.y], [shape.x + shape.width, shape.y + shape.height]]
    return points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && x >= -0.01 && x <= PREVIEW_WIDTH + 0.01 && y >= -0.01 && y <= PREVIEW_HEIGHT + 0.01)
  })
/** How many times a polyline crosses the middle going upward. */
const risingCrossings = (points: readonly Point[]) => points.slice(1).filter((p, i) => points[i]![1] > PREVIEW_HEIGHT / 2 && p[1] <= PREVIEW_HEIGHT / 2).length

describe('the oscillator', () => {
  it('draws more cycles for a higher pitch, between one and eight', () => {
    const cycles = (frequency: number) => risingCrossings(main(oscillatorPreview({ waveform: 0, frequency })))
    expect(cycles(20)).toBeLessThanOrEqual(1)
    expect(cycles(220)).toBeGreaterThan(cycles(60))
    expect(cycles(4000)).toBeGreaterThan(cycles(220))
    expect(cyclesForFrequency(20)).toBe(1)
    expect(cyclesForFrequency(1e6)).toBe(8)
  })

  it('follows detune: an octave up (1200 ct) has more cycles than none', () => {
    expect(cyclesForFrequency(220 * 2)).toBeGreaterThan(cyclesForFrequency(220))
    const flat = risingCrossings(main(oscillatorPreview({ frequency: 440, detune: 0 })))
    const sharp = risingCrossings(main(oscillatorPreview({ frequency: 440, detune: 1200 })))
    expect(sharp).toBeGreaterThanOrEqual(flat)
  })

  it('draws each wave: a square only has two heights, a sine has many, a saw ramps', () => {
    const heights = (waveform: number) => new Set(main(oscillatorPreview({ waveform, frequency: 220 })).map(([, y]) => y))
    expect(heights(2).size).toBe(2)
    expect(heights(0).size).toBeGreaterThan(10)
    const saw = main(oscillatorPreview({ waveform: 1, frequency: 20 }))
    expect(saw[0]![1]).toBeGreaterThan(saw[Math.floor(saw.length / 2) - 2]![1]) // starts low (large y) and rises
  })

  it('stays inside its box for any value, and survives numbers out of range', () => {
    for (const frequency of [-5, 0, 20, 4000, 1e9, Number.NaN]) {
      for (const waveform of [-1, 0, 1, 2, 3, 9]) expect(inside(oscillatorPreview({ waveform, frequency })), `${waveform} ${frequency}`).toBe(true)
    }
  })
})

describe('the filter', () => {
  it('a lowpass passes the lows and cuts the highs, and is 3 dB down at the cutoff (Q 0.707)', () => {
    expect(responseDb(0, 2000, 0.707, 100)).toBeGreaterThan(-0.5)
    expect(responseDb(0, 2000, 0.707, 16000)).toBeLessThan(-30)
    expect(responseDb(0, 2000, 0.707, 2000)).toBeCloseTo(-3, 0)
  })

  it('a highpass is the other way round, and a bandpass peaks at the cutoff', () => {
    expect(responseDb(1, 2000, 0.707, 100)).toBeLessThan(-30)
    expect(responseDb(1, 2000, 0.707, 16000)).toBeGreaterThan(-0.5)
    expect(responseDb(2, 2000, 5, 2000)).toBeGreaterThan(responseDb(2, 2000, 5, 200))
    expect(responseDb(2, 2000, 5, 2000)).toBeGreaterThan(responseDb(2, 2000, 5, 20000))
  })

  it('resonance makes a peak at the cutoff', () => {
    expect(responseDb(0, 2000, 10, 2000)).toBeGreaterThan(15)
    expect(responseDb(0, 2000, 0.707, 2000)).toBeLessThan(0)
  })

  it('the curve falls where the cutoff says, and moves with it', () => {
    const edge = (cutoff: number) => {
      const points = main(filterPreview({ mode: 0, cutoff, resonance: 0.707 }))
      const half = (points[0]![1] + points.at(-1)![1]) / 2
      return points.findIndex(([, y]) => y > half)
    }
    expect(edge(200)).toBeLessThan(edge(2000))
    expect(edge(2000)).toBeLessThan(edge(10000))
  })

  it('draws a dim 0 dB line and keeps the curve inside the box, whatever the numbers', () => {
    const preview = filterPreview({ mode: 0, cutoff: 2000, resonance: 20 })
    expect(lines(preview, 'dim')).toHaveLength(1)
    expect(TOP_DB).toBeGreaterThan(0)
    expect(BOTTOM_DB).toBeLessThan(0)
    for (const resonance of [0, 0.1, 20, 1e9, Number.NaN]) for (const mode of [0, 1, 2, 7]) expect(inside(filterPreview({ mode, cutoff: 1e6, resonance })), `${mode} ${resonance}`).toBe(true)
  })
})

describe('the envelope', () => {
  const shape = (values: Record<string, number>) => {
    const area = envelopePreview(values).shapes.find((s) => s.kind === 'area')
    return area && area.kind === 'area' ? area.points : []
  }

  it('rises to full, falls to the sustain level, holds, and falls to nothing', () => {
    const [start, peak, decayed, held, end] = shape({ attack: 0.1, decay: 0.2, sustain: 0.5, release: 0.3 })
    expect(start![1]).toBeGreaterThan(peak![1]) // y is down: the peak is higher up
    expect(decayed![1]).toBeGreaterThan(peak![1])
    expect(decayed![1]).toBe(held![1])
    expect(end![1]).toBe(start![1])
    const bottom = PREVIEW_HEIGHT - 3
    const top = 3
    expect(peak![1]).toBe(top)
    expect(decayed![1]).toBeCloseTo((top + bottom) / 2, 1)
  })

  it('a longer attack, decay or release takes more width, in that order of segments', () => {
    const width = (values: Record<string, number>, from: number, to: number) => shape(values)[to]![0] - shape(values)[from]![0]
    const base = { attack: 0.01, decay: 0.15, sustain: 0.6, release: 0.25 }
    expect(width({ ...base, attack: 2 }, 0, 1)).toBeGreaterThan(width(base, 0, 1))
    expect(width({ ...base, decay: 2 }, 1, 2)).toBeGreaterThan(width(base, 1, 2))
    expect(width({ ...base, release: 4 }, 3, 4)).toBeGreaterThan(width(base, 3, 4))
  })

  it('sustain 1 is flat at the top and sustain 0 falls to the bottom; the shape spans the picture', () => {
    expect(shape({ sustain: 1 })[2]![1]).toBe(shape({ sustain: 1 })[1]![1])
    expect(shape({ sustain: 0 })[2]![1]).toBe(shape({ sustain: 0 })[0]![1])
    expect(shape({})[0]![0]).toBeLessThan(5)
    expect(shape({}).at(-1)![0]).toBeGreaterThan(PREVIEW_WIDTH - 5)
  })

  it('stays inside its box for extreme times', () => {
    for (const attack of [0, 0.001, 4, 1e9]) expect(inside(envelopePreview({ attack, decay: 4, release: 6, sustain: 2 }))).toBe(true)
  })
})

describe('the LFO', () => {
  it('is as tall as its depth, around a dim zero line', () => {
    const swing = (depth: number) => {
      const ys = main(lfoPreview({ shape: 0, rate: 2, depth })).map(([, y]) => y)
      return Math.max(...ys) - Math.min(...ys)
    }
    expect(swing(1)).toBeGreaterThan(swing(0.5) * 1.8)
    expect(swing(0)).toBe(0)
    expect(lines(lfoPreview({}), 'dim')).toHaveLength(1)
  })

  it('shows more cycles at a faster rate, and random holds a value per cycle', () => {
    const cycles = (rate: number) => risingCrossings(main(lfoPreview({ shape: 0, rate, depth: 1 })))
    expect(cycles(30)).toBeGreaterThan(cycles(0.05))
    const random = main(lfoPreview({ shape: 4, rate: 2, depth: 1 }))
    expect(new Set(random.map(([, y]) => y)).size).toBeLessThan(10)
  })

  it('stays inside its box', () => {
    for (const shape of [0, 1, 2, 3, 4, 9]) for (const rate of [0, 0.05, 30, 1e6]) expect(inside(lfoPreview({ shape, rate, depth: 7 }))).toBe(true)
  })
})

describe('level, pan and width', () => {
  const rects = (preview: Preview) => preview.shapes.flatMap((shape) => (shape.kind === 'rect' ? [shape] : []))
  const dots = (preview: Preview) => preview.shapes.flatMap((shape) => (shape.kind === 'dot' ? [shape] : []))

  it('gain fills a bar in proportion, half way at unity', () => {
    const fill = (gain: number) => rects(gainPreview({ gain })).find((rect) => rect.filled)!.width
    const track = rects(gainPreview({ gain: 1 })).find((rect) => !rect.filled)!.width
    expect(fill(0)).toBe(0)
    expect(fill(1)).toBeCloseTo(track / 2, 1)
    expect(fill(2)).toBeCloseTo(track, 1)
    expect(fill(99)).toBeCloseTo(track, 1)
  })

  it('pan puts a dot left, centre or right', () => {
    const at = (pan: number) => dots(panPreview({ pan }))[0]!.x
    expect(at(-1)).toBeLessThan(at(0))
    expect(at(0)).toBeLessThan(at(1))
    expect(at(0)).toBeCloseTo(PREVIEW_WIDTH / 2, 1)
  })

  it('width spreads two dots from the centre: none at 0, as far as the picture allows at 2', () => {
    const gap = (width: number) => {
      const [a, b] = dots(widthPreview({ width }))
      return b!.x - a!.x
    }
    expect(gap(0)).toBe(0)
    expect(gap(1)).toBeGreaterThan(0)
    expect(gap(2)).toBeGreaterThan(gap(1))
    for (const preview of [gainPreview({ gain: Number.NaN }), panPreview({ pan: 9 }), widthPreview({ width: -3 })]) expect(inside(preview)).toBe(true)
  })
})

describe('delay and reverb', () => {
  const bars = (preview: Preview) => lines(preview).map((points) => ({ x: points[0]![0], height: points[0]![1] - points[1]![1] }))

  it('the delay draws its echoes a time apart, each quieter by the feedback, the first at the mix', () => {
    const echoes = bars(delayPreview({ time: 0.3, feedback: 0.5, mix: 0.8 }))
    expect(echoes.length).toBeGreaterThan(2)
    const gap = echoes[1]!.x - echoes[0]!.x
    expect(echoes[2]!.x - echoes[1]!.x).toBeCloseTo(gap, 1)
    expect(echoes[1]!.height / echoes[2]!.height).toBeCloseTo(2, 1)
    expect(echoes[0]!.height).toBeCloseTo((PREVIEW_HEIGHT - 6) * 0.8, 0)
  })

  it('a longer time spaces them out and shows fewer; more feedback shows more; no mix shows none', () => {
    expect(bars(delayPreview({ time: 1, feedback: 0.5, mix: 1 })).length).toBeLessThan(bars(delayPreview({ time: 0.1, feedback: 0.5, mix: 1 })).length)
    expect(bars(delayPreview({ time: 0.1, feedback: 0.9, mix: 1 })).length).toBeGreaterThan(bars(delayPreview({ time: 0.1, feedback: 0.2, mix: 1 })).length)
    expect(bars(delayPreview({ time: 0.3, feedback: 0.5, mix: 0 }))).toHaveLength(0) // only the dim dry bar is left
    // Synced, Time is in beats: one beat is drawn as half a second (120 BPM).
    expect(bars(delayPreview({ time: 0.6, feedback: 0.5, mix: 1, sync: 1 }))).toEqual(bars(delayPreview({ time: 0.3, feedback: 0.5, mix: 1 })))
  })

  it('the reverb tail is longer for a bigger room, taller for more mix, and starts later with predelay', () => {
    const tail = (values: Record<string, number>) => {
      const area = reverbPreview(values).shapes.find((s) => s.kind === 'area')
      return area && area.kind === 'area' ? area.points : []
    }
    const length = (values: Record<string, number>) => tail(values).at(-1)![0] - tail(values)[0]![0]
    expect(length({ size: 0.95 })).toBeGreaterThan(length({ size: 0.2 }))
    expect(length({ size: 0.6, damping: 1 })).toBeLessThan(length({ size: 0.6, damping: 0 }))
    expect(tail({ mix: 1 })[0]![1]).toBeLessThan(tail({ mix: 0.2 })[0]![1])
    expect(tail({ predelay: 100 })[0]![0]).toBeGreaterThan(tail({ predelay: 0 })[0]![0])
  })

  it('stays inside its box', () => {
    for (const time of [0, 0.001, 2, 99]) expect(inside(delayPreview({ time, feedback: 5, mix: 5 }))).toBe(true)
    for (const size of [-1, 0, 1, 9]) expect(inside(reverbPreview({ size, damping: 9, predelay: 999, mix: 9 }))).toBe(true)
  })
})

describe('the set of pictures', () => {
  it('has one for the sound nodes the plan names, and none for the rest', () => {
    for (const type of ['oscillator', 'filter', 'envelope', 'lfo', 'gain', 'pan', 'width', 'delay', 'pingPong', 'reverb', 'stereoReverb']) {
      expect(hasPreview(type), type).toBe(true)
      expect(nodePreview(type, {})?.shapes.length, type).toBeGreaterThan(0)
    }
    for (const type of ['note', 'sampler', 'output', 'control', 'add', 'trackIn', 'send', 'unknown']) {
      expect(hasPreview(type), type).toBe(false)
      expect(nodePreview(type, {})).toBeUndefined()
    }
  })

  it('every picture is made of finite numbers with defaults only', () => {
    for (const type of ['oscillator', 'filter', 'envelope', 'lfo', 'gain', 'pan', 'width', 'delay', 'reverb']) expect(inside(nodePreview(type, {})!), type).toBe(true)
  })

  it('wavePoints is exactly as wide as the picture', () => {
    const points = wavePoints('sine', 3, 1)
    expect(points[0]![0]).toBe(0)
    expect(points.at(-1)![0]).toBe(PREVIEW_WIDTH)
  })
})
