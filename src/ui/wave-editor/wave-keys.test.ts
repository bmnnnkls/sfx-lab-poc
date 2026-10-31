import { DEFAULT_WAVE_VIEW, type WaveEditorView, type WaveSelection } from '@state'
import { describe, expect, it } from 'vitest'
import { WHEEL_ZOOM } from './wave-geometry'
import { waveKeyAction } from './wave-keys'

const FRAMES = 100_000
const WIDTH = 1000
/** Zoomed to 10 frames a column, showing frames 20,000 to 30,000. */
const zoomed: WaveEditorView = { ...DEFAULT_WAVE_VIEW, framesPerPixel: 10, startFrame: 20_000, cursor: 25_000 }
const at = (cursor: number, selection: WaveSelection | null = null): WaveEditorView => ({ ...zoomed, cursor, selection })
const keyed = (key: string, view: WaveEditorView) => waveKeyAction(key, view, FRAMES, WIDTH)
const both = (from: number, to: number): WaveSelection => ({ from, to, channels: 'both' })

describe('the view keys', () => {
  it('⌘A selects all, on the channels the selection had, else both', () => {
    expect(keyed('mod+a', at(500))).toEqual({ selection: both(0, FRAMES) })
    expect(keyed('mod+a', at(500, { from: 10, to: 20, channels: 'right' }))).toEqual({ selection: { from: 0, to: FRAMES, channels: 'right' } })
  })

  it('Escape clears the selection, with the cursor at its start; without one it is not a view key', () => {
    expect(keyed('escape', at(25_000, both(22_000, 24_000)))).toEqual({ selection: null, cursor: 22_000 })
    expect(keyed('escape', at(25_000))).toBeNull()
  })

  it('← and → move the cursor a column, inside the sample; with a selection, collapse it to that side', () => {
    expect(keyed('arrowleft', at(25_000))).toEqual({ selection: null, cursor: 24_990 })
    expect(keyed('arrowright', at(25_000))).toEqual({ selection: null, cursor: 25_010 })
    expect(keyed('arrowright', at(22_000, both(22_000, 24_000)))).toEqual({ selection: null, cursor: 24_000 })
    expect(keyed('arrowleft', at(24_000, both(22_000, 24_000)))).toEqual({ selection: null, cursor: 22_000 })
    // At the ends, a fitted view: one frame a column at least, and no further than the sample.
    expect(keyed('arrowleft', { ...DEFAULT_WAVE_VIEW, cursor: 0 })).toEqual({ selection: null, cursor: 0 })
    expect(keyed('arrowright', { ...DEFAULT_WAVE_VIEW, cursor: FRAMES })).toEqual({ selection: null, cursor: FRAMES })
    expect(keyed('arrowright', { ...DEFAULT_WAVE_VIEW, framesPerPixel: 0.1, cursor: 50 })?.cursor).toBe(51)
  })

  it('Shift with ← → selects from the cursor, then moves the end the cursor is on', () => {
    expect(keyed('shift+arrowright', at(25_000))).toEqual({ selection: both(25_000, 25_010), cursor: 25_010 })
    expect(keyed('shift+arrowleft', at(25_000))).toEqual({ selection: both(24_990, 25_000), cursor: 24_990 })
    // The cursor on the end: that end moves, the other stays, across it too.
    expect(keyed('shift+arrowright', at(25_010, both(25_000, 25_010)))).toEqual({ selection: both(25_000, 25_020), cursor: 25_020 })
    expect(keyed('shift+arrowleft', at(25_000, both(25_000, 25_010)))).toEqual({ selection: both(24_990, 25_010), cursor: 24_990 })
    expect(keyed('shift+arrowleft', at(25_010, both(25_000, 25_010)))).toEqual({ selection: null, cursor: 25_000 })
    // The cursor elsewhere (a mouse drag): the end moves. One channel stays one channel.
    expect(keyed('shift+arrowright', at(10, { from: 25_000, to: 25_010, channels: 'left' }))).toEqual({ selection: { from: 25_000, to: 25_020, channels: 'left' }, cursor: 25_020 })
  })

  it('Alt with ← → moves the cursor a tenth of the view', () => {
    expect(keyed('alt+arrowright', at(25_000))).toEqual({ selection: null, cursor: 26_000 })
    expect(keyed('alt+arrowleft', at(25_000, both(22_000, 24_000)))).toEqual({ selection: null, cursor: 21_000 })
  })

  it('Home and End move the cursor to the ends; with Shift, select to there', () => {
    expect(keyed('home', { ...DEFAULT_WAVE_VIEW, cursor: 500 })).toEqual({ selection: null, cursor: 0 })
    expect(keyed('end', { ...DEFAULT_WAVE_VIEW, cursor: 500, selection: both(10, 20) })).toEqual({ selection: null, cursor: FRAMES })
    expect(keyed('shift+home', { ...DEFAULT_WAVE_VIEW, cursor: 500 })).toEqual({ selection: both(0, 500), cursor: 0 })
    expect(keyed('shift+end', { ...DEFAULT_WAVE_VIEW, cursor: 10, selection: both(10, 20) })).toEqual({ selection: both(20, FRAMES), cursor: FRAMES })
  })

  it('+, = and − zoom by two wheel notches around the cursor, or the middle when it is outside the view', () => {
    const inward = keyed('=', at(25_000))!.view!
    expect(inward.framesPerPixel).toBeCloseTo(10 / WHEEL_ZOOM ** 2)
    // The cursor keeps its column (500).
    expect((25_000 - inward.startFrame) / inward.framesPerPixel!).toBeCloseTo(500)
    expect(keyed('shift+plus', at(25_000))).toEqual(keyed('=', at(25_000)))
    expect(keyed('plus', at(25_000))).toEqual(keyed('=', at(25_000)))
    const outward = keyed('-', at(90_000))!.view!
    expect(outward.framesPerPixel).toBeCloseTo(10 * WHEEL_ZOOM ** 2)
    // Around the middle column: frame 25,000 stays there.
    expect((25_000 - outward.startFrame) / outward.framesPerPixel!).toBeCloseTo(500)
  })

  it('Z zooms to the selection, Shift+Z to fit, and P plays', () => {
    expect(keyed('z', at(0, both(100, 300)))).toEqual({ zoom: { from: 100, to: 300 } })
    expect(keyed('z', at(0))).toBeNull()
    expect(keyed('shift+z', at(0))).toEqual({ zoom: 'fit' })
    expect(keyed('p', at(0))).toEqual({ play: true })
  })

  it("leaves other keys alone: the edit keys, the browser's, letters with ⌘", () => {
    for (const key of ['delete', 'mod+c', 'mod+v', 'mod+z', 'space', 'mod+=', 'mod+-', 'q', 'arrowup']) expect(keyed(key, at(0)), key).toBeNull()
  })
})

describe('the view follows the cursor', () => {
  it('scrolls by the least that shows a cursor moved past either edge', () => {
    expect(keyed('arrowright', at(30_000))).toEqual({ selection: null, cursor: 30_010, view: { framesPerPixel: 10, startFrame: 20_010 } })
    expect(keyed('arrowleft', at(20_000))).toEqual({ selection: null, cursor: 19_990, view: { framesPerPixel: 10, startFrame: 19_990 } })
    expect(keyed('end', at(25_000))).toEqual({ selection: null, cursor: FRAMES, view: { framesPerPixel: 10, startFrame: 90_000 } })
    expect(keyed('shift+home', at(25_000))).toEqual({ selection: both(0, 25_000), cursor: 0, view: { framesPerPixel: 10, startFrame: 0 } })
  })

  it("doesn't scroll a fitted view", () => {
    expect(keyed('end', { ...DEFAULT_WAVE_VIEW, cursor: 10 })).toEqual({ selection: null, cursor: FRAMES })
  })
})
