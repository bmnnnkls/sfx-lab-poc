import { describe, expect, it } from 'vitest'
import { laneParts, levelMarks } from './lane-renderers'
import { DEFAULT_WAVE_VIEW } from '@state'
import { formatBeat, formatTime, rulerTicks } from './ruler-ticks'
import { partAt } from './use-wave-gestures'
import { EDGE_PX, MIN_FRAMES_PER_PIXEL, autoScrollFrames, boxEdgeAt, boxEdgeCursor, clampView, frameAt, menuTargetAt, selectionEdgeAt, resolveView, resolveZoom, xOf, zoomAround, zoomTo } from './wave-geometry'

const FRAMES = 480_000 // 10 s at 48 kHz

describe('the view', () => {
  it('opens fitted to the width, and keeps a zoom between 32 px per frame and the whole sample', () => {
    expect(resolveView(DEFAULT_WAVE_VIEW, FRAMES, 1000)).toEqual({ startFrame: 0, framesPerPixel: 480, width: 1000 })
    expect(clampView({ startFrame: 0, framesPerPixel: 1e-6, width: 1000 }, FRAMES).framesPerPixel).toBe(MIN_FRAMES_PER_PIXEL)
    expect(clampView({ startFrame: 0, framesPerPixel: 1e6, width: 1000 }, FRAMES).framesPerPixel).toBe(480)
    expect(clampView({ startFrame: 479_990, framesPerPixel: 10, width: 1000 }, FRAMES).startFrame).toBe(470_000)
    expect(clampView({ startFrame: -5, framesPerPixel: 10, width: 1000 }, FRAMES).startFrame).toBe(0)
  })

  it('zooms around the pointer, and to a range', () => {
    const view = { startFrame: 10_000, framesPerPixel: 100, width: 1000 }
    const closer = zoomAround(view, 0.5, 200, FRAMES)
    expect(closer).toEqual({ startFrame: 20_000, framesPerPixel: 50, width: 1000 })
    expect(frameAt(closer, 200, FRAMES)).toBe(frameAt(view, 200, FRAMES))
    expect(zoomTo(1000, 1500, 1000, FRAMES)).toEqual({ startFrame: 1000, framesPerPixel: 0.5, width: 1000 })
    expect(xOf(closer, 25_000)).toBe(100)
  })
})

describe('the ruler', () => {
  it('formats time as m:ss.mmm, and beats as bar.beat(.sixteenth)', () => {
    expect([0, 1.5, 61.0625, 600].map(formatTime)).toEqual(['0:00.000', '0:01.500', '1:01.063', '10:00.000'])
    expect([0, 1, 3.75, 4, 9.5].map(formatBeat)).toEqual(['1.1', '1.2', '1.4.4', '2.1', '3.2.3'])
  })

  it('labels time at steps at least 72 px apart', () => {
    // 480 frames per pixel at 48 kHz: 100 px per second, so a label every second.
    const ticks = rulerTicks({ startFrame: 0, framesPerPixel: 480, width: 350 }, 48000, 'time', 120)
    expect(ticks.map((tick) => tick.label)).toEqual(['0:00.000', '0:01.000', '0:02.000', '0:03.000'])
    expect(ticks.map((tick) => tick.x)).toEqual([0, 100, 200, 300])
    // Scrolled half a second in, the first label is at 1 s.
    expect(rulerTicks({ startFrame: 24000, framesPerPixel: 480, width: 150 }, 48000, 'time', 120)[0]).toEqual({ x: 50, label: '0:01.000' })
    // 10 frames per pixel: 4.8 px per ms, so every 20 ms.
    expect(rulerTicks({ startFrame: 0, framesPerPixel: 10, width: 200 }, 48000, 'time', 120).map((tick) => tick.label)).toEqual(['0:00.000', '0:00.020', '0:00.040'])
  })

  it('counts frames when zoomed in past one frame per pixel', () => {
    const ticks = rulerTicks({ startFrame: 1000, framesPerPixel: 1 / 16, width: 300 }, 48000, 'time', 120)
    expect(ticks.map((tick) => tick.label)).toEqual(['1000', '1005', '1010', '1015'])
  })

  it('counts bars and beats in 4/4 at the tempo it is given', () => {
    // 120 BPM: a beat is 24000 frames, 50 px at 480 frames per pixel; labels every two beats.
    expect(rulerTicks({ startFrame: 0, framesPerPixel: 480, width: 400 }, 48000, 'beats', 120).map((tick) => tick.label)).toEqual(['1.1', '1.3', '2.1', '2.3', '3.1'])
    // 60 BPM: twice as far apart, a label every beat.
    expect(rulerTicks({ startFrame: 0, framesPerPixel: 480, width: 400 }, 48000, 'beats', 60).map((tick) => tick.label)).toEqual(['1.1', '1.2', '1.3', '1.4', '2.1'])
  })
})

describe('a zoom asked for', () => {
  it('fits the sample, or shows the range across the width', () => {
    expect(resolveZoom('fit', 1000, FRAMES, DEFAULT_WAVE_VIEW)).toEqual({ framesPerPixel: null, startFrame: 0 })
    expect(resolveZoom({ from: 1000, to: 1500 }, 1000, FRAMES, DEFAULT_WAVE_VIEW)).toEqual({ framesPerPixel: 0.5, startFrame: 1000 })
  })

  it('scrolls by the least that shows a frame, at the same zoom', () => {
    const zoomed = { ...DEFAULT_WAVE_VIEW, framesPerPixel: 2, startFrame: 1000 }
    expect(resolveZoom({ show: 1500 }, 1000, FRAMES, zoomed)).toEqual({ framesPerPixel: 2, startFrame: 1000 })
    expect(resolveZoom({ show: 500 }, 1000, FRAMES, zoomed)).toEqual({ framesPerPixel: 2, startFrame: 500 })
    expect(resolveZoom({ show: 4000 }, 1000, FRAMES, zoomed)).toEqual({ framesPerPixel: 2, startFrame: 2000 })
    expect(resolveZoom({ show: 4000 }, 1000, FRAMES, DEFAULT_WAVE_VIEW)).toEqual({ framesPerPixel: null, startFrame: 0 })
  })
})

describe('a right-click', () => {
  const left = { from: 100, to: 200, channels: 'left' as const }
  it('keeps the selection inside it, on a channel it covers', () => {
    expect(menuTargetAt(left, 150, 0)).toBe('keep')
    expect(menuTargetAt({ ...left, channels: 'both' }, 100, 1)).toBe('keep')
    expect(menuTargetAt({ ...left, channels: 'both' }, 200, 0)).toBe('keep')
  })

  it('clears it and puts the cursor there anywhere else', () => {
    expect(menuTargetAt(left, 250, 0)).toEqual({ cursor: 250 })
    expect(menuTargetAt(left, 150, 1)).toEqual({ cursor: 150 })
    expect(menuTargetAt(null, 40, 0)).toEqual({ cursor: 40 })
  })
})

describe('the level scale', () => {
  it('marks 0, −6, −12 dB above and below the middle and −∞ on it, labelled where there is room', () => {
    const marks = levelMarks(200)
    expect(marks.map((mark) => mark.label)).toEqual(['0', '−6', '−12', '−∞'])
    expect(marks[0]!.ys).toEqual([0, 200])
    expect(marks[1]!.ys[0]).toBeCloseTo(100 - 50.1, 1)
    expect(marks[3]!.ys).toEqual([100])
    // In a low lane the labels that would touch are left out; the lines stay.
    expect(levelMarks(40).map((mark) => mark.label)).toEqual(['0', null, '−12', null])
  })
})

describe('a selection edge', () => {
  /** 10 frames a column from frame 0: the selection's edges are at columns 10 and 30. */
  const view = { startFrame: 0, framesPerPixel: 10, width: 1000 }
  const selection = { from: 100, to: 300, channels: 'left' as const }
  it('is under the pointer within EDGE_PX of it, on a channel the selection covers', () => {
    expect(selectionEdgeAt(view, selection, 10, 0)).toBe('from')
    expect(selectionEdgeAt(view, selection, 10 - EDGE_PX, 0)).toBe('from')
    expect(selectionEdgeAt(view, selection, 30 + EDGE_PX, 0)).toBe('to')
    expect(selectionEdgeAt(view, selection, 20, 0)).toBeNull()
    expect(selectionEdgeAt(view, selection, 10 - EDGE_PX - 1, 0)).toBeNull()
    expect(selectionEdgeAt(view, selection, 10, 1)).toBeNull()
    expect(selectionEdgeAt(view, null, 10, 0)).toBeNull()
  })

  it('is the nearer one on a selection narrower than two EDGE_PX', () => {
    const narrow = { from: 100, to: 150, channels: 'both' as const }
    expect(selectionEdgeAt(view, narrow, 11, 1)).toBe('from')
    expect(selectionEdgeAt(view, narrow, 14, 1)).toBe('to')
    expect(selectionEdgeAt(view, narrow, 12.5, 1)).toBe('from')
  })
})

describe('a box', () => {
  /** 10 frames a column: the box is columns 10 to 30 and rows 20 (2 kHz) to 200 (200 Hz), on a scale of 10 Hz a row from 2.2 kHz at the top. */
  const view = { startFrame: 0, framesPerPixel: 10, width: 1000 }
  const box = { from: 100, to: 300, channels: 'left' as const, band: { low: 200, high: 2000 } }
  const rowOf = (hz: number) => (2200 - hz) / 10
  const edge = (x: number, y: number, channel = 0) => boxEdgeAt(view, box, x, y, channel, rowOf)

  it('drags its time edges, its band edges and its corners, within EDGE_PX of them and of the box', () => {
    expect(edge(10, 40)).toEqual({ time: 'from', band: null })
    expect(edge(30 + EDGE_PX, 40)).toEqual({ time: 'to', band: null })
    expect(edge(20, 20)).toEqual({ time: null, band: 'high' })
    expect(edge(20, 200 + EDGE_PX)).toEqual({ time: null, band: 'low' })
    expect(edge(10, 20)).toEqual({ time: 'from', band: 'high' })
    expect(edge(31, 199)).toEqual({ time: 'to', band: 'low' })
    // Inside, outside, beside an edge's line past the box, on a channel it doesn't cover, and without a band.
    expect(edge(20, 40)).toBeNull()
    expect(edge(10, 20 - EDGE_PX - 1)).toBeNull()
    expect(edge(10 - EDGE_PX - 1, 40)).toBeNull()
    expect(edge(10, 40, 1)).toBeNull()
    expect(boxEdgeAt(view, { ...box, band: undefined }, 10, 40, 0, rowOf)).toBeNull()
  })

  it('shows a resize cursor along its edge', () => {
    expect([
      boxEdgeCursor({ time: 'from', band: null }),
      boxEdgeCursor({ time: null, band: 'low' }),
      boxEdgeCursor({ time: 'from', band: 'high' }),
      boxEdgeCursor({ time: 'to', band: 'low' }),
      boxEdgeCursor({ time: 'to', band: 'high' }),
    ]).toEqual(['ew-resize', 'ns-resize', 'nwse-resize', 'nwse-resize', 'nesw-resize'])
  })

  it('keeps on a right-click inside it in time and frequency; outside either it moves the cursor', () => {
    expect(menuTargetAt(box, 150, 0, 1000)).toBe('keep')
    expect(menuTargetAt(box, 150, 0, 3000)).toEqual({ cursor: 150 })
    expect(menuTargetAt(box, 150, 0, 100)).toEqual({ cursor: 150 })
    expect(menuTargetAt(box, 400, 0, 1000)).toEqual({ cursor: 400 })
    // In the waveform part (no frequency), its time range.
    expect(menuTargetAt(box, 150, 0)).toBe('keep')
  })
})

describe('a lane’s parts', () => {
  it('say which part a row is in, and the row in it', () => {
    const split = laneParts('split')
    expect(partAt(split, 10, 300)).toEqual({ kind: 'waveform', y: 10, height: 100 })
    expect(partAt(split, 150, 300)).toEqual({ kind: 'spectrogram', y: 50, height: 200 })
    expect(partAt(split, -5, 300)).toEqual({ kind: 'waveform', y: -5, height: 100 })
    expect(partAt(split, 320, 300)).toEqual({ kind: 'spectrogram', y: 220, height: 200 })
    expect(partAt(laneParts('spectrogram'), 10, 300)).toEqual({ kind: 'spectrogram', y: 10, height: 300 })
  })
})

describe('the auto-scroll', () => {
  it('is none inside, grows with the distance past the edge, and is capped at a quarter of the view', () => {
    expect(autoScrollFrames(0, 10, 1000)).toBe(0)
    expect(autoScrollFrames(20, 10, 1000)).toBe(20)
    expect(autoScrollFrames(-50, 10, 1000)).toBe(-50)
    expect(autoScrollFrames(100, 10, 1000)).toBeGreaterThan(autoScrollFrames(20, 10, 1000))
    expect(autoScrollFrames(1e6, 10, 1000)).toBe(2500)
    expect(autoScrollFrames(-1e6, 10, 1000)).toBe(-2500)
  })
})
