import { describe, expect, it } from 'vitest'
import { DEFAULT_WAVE_VIEW } from '@state'
import { formatBeat, formatTime, rulerTicks } from './ruler-ticks'
import { MIN_FRAMES_PER_PIXEL, clampView, frameAt, resolveView, xOf, zoomAround, zoomTo } from './wave-geometry'

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
