import { describe, expect, it } from 'vitest'
import {
  type SampleInfo,
  SAMPLE_MARK_LIMITS,
  addMarker,
  addRegion,
  moveLoop,
  moveMarker,
  removeMarker,
  removeRegion,
  renameMarker,
  setLoop,
  updateRegion,
} from '.'

/** 1000 frames. */
const INFO: SampleInfo = { id: 'a'.repeat(64), name: 'Kick', extension: 'wav', durationSeconds: 1, sampleRate: 1000, channels: 1, bytes: 1 }

const withMarkers = addMarker(addMarker(addMarker(INFO, 500, undefined, 'b'), 100, undefined, 'a'), 900, 'End', 'c')

describe('markers', () => {
  it.each([
    { what: 'a frame inside', frame: 250, expected: 250 },
    { what: 'a fraction, rounded', frame: 250.6, expected: 251 },
    { what: 'before the start, clamped', frame: -20, expected: 0 },
    { what: 'past the end, clamped to the end', frame: 1200, expected: 1000 },
  ])('adds one at $what', ({ frame, expected }) => {
    expect(addMarker(INFO, frame, undefined, 'm').markers).toEqual([{ id: 'm', frame: expected, name: 'Marker 1' }])
  })

  it('keeps them in frame order, and names each new one the lowest free Marker N', () => {
    expect(withMarkers.markers).toEqual([
      { id: 'a', frame: 100, name: 'Marker 2' },
      { id: 'b', frame: 500, name: 'Marker 1' },
      { id: 'c', frame: 900, name: 'End' },
    ])
    const gap = removeMarker(withMarkers, 'b')
    expect(addMarker(gap, 0, undefined, 'd').markers![0]).toEqual({ id: 'd', frame: 0, name: 'Marker 1' })
  })

  it('moves one, clamped, and keeps the order', () => {
    expect(moveMarker(withMarkers, 'a', 950).markers!.map((marker) => marker.id)).toEqual(['b', 'c', 'a'])
    expect(moveMarker(withMarkers, 'a', -5).markers![0]).toEqual({ id: 'a', frame: 0, name: 'Marker 2' })
  })

  it('renames one, cut to the limit; an empty name changes nothing', () => {
    expect(renameMarker(withMarkers, 'a', '  Snare  ').markers![0]!.name).toBe('Snare')
    expect(renameMarker(withMarkers, 'a', 'x'.repeat(80)).markers![0]!.name).toBe('x'.repeat(SAMPLE_MARK_LIMITS.name))
    expect(renameMarker(withMarkers, 'a', '   ')).toBe(withMarkers)
  })

  it('returns the same info when nothing changes', () => {
    expect(moveMarker(withMarkers, 'a', 100)).toBe(withMarkers)
    expect(moveMarker(withMarkers, 'nope', 5)).toBe(withMarkers)
    expect(removeMarker(withMarkers, 'nope')).toBe(withMarkers)
    expect(renameMarker(withMarkers, 'c', 'End')).toBe(withMarkers)
  })

  it('adds none at the limit, or to an empty sample', () => {
    const full: SampleInfo = { ...INFO, markers: Array.from({ length: SAMPLE_MARK_LIMITS.markers }, (_, i) => ({ id: `m${i}`, frame: i, name: '' })) }
    expect(addMarker(full, 5)).toBe(full)
    const empty = { ...INFO, durationSeconds: 0 }
    expect(addMarker(empty, 0)).toBe(empty)
  })
})

describe('regions', () => {
  const two = addRegion(addRegion(INFO, { from: 600, to: 800 }, undefined, 'b'), { from: 100, to: 300 }, 'Intro', 'a')

  it('adds them in order of their start, with Region N names', () => {
    expect(two.regions).toEqual([
      { id: 'a', from: 100, to: 300, name: 'Intro' },
      { id: 'b', from: 600, to: 800, name: 'Region 1' },
    ])
  })

  it.each([
    { what: 'backwards, put in order', range: { from: 300, to: 100 }, expected: { from: 100, to: 300 } },
    { what: 'past the end, clamped', range: { from: 900, to: 1500 }, expected: { from: 900, to: 1000 } },
    { what: 'empty, made one frame', range: { from: 400, to: 400 }, expected: { from: 400, to: 401 } },
    { what: 'empty at the end, made the last frame', range: { from: 1000, to: 1200 }, expected: { from: 999, to: 1000 } },
  ])('adds one $what', ({ range, expected }) => {
    expect(addRegion(INFO, range, undefined, 'r').regions).toEqual([{ id: 'r', ...expected, name: 'Region 1' }])
  })

  it('moves an edge, which stops a frame short of the other, and re-sorts', () => {
    expect(updateRegion(two, 'a', { from: 50 }).regions![0]).toMatchObject({ from: 50, to: 300 })
    expect(updateRegion(two, 'a', { from: 500 }).regions![0]).toMatchObject({ from: 299, to: 300 })
    expect(updateRegion(two, 'a', { to: 20 }).regions![0]).toMatchObject({ from: 100, to: 101 })
    expect(updateRegion(two, 'b', { from: 0, to: 50 }).regions!.map((region) => region.id)).toEqual(['b', 'a'])
  })

  it('renames one; an empty name, or no change, keeps the same info', () => {
    expect(updateRegion(two, 'b', { name: 'Tail' }).regions![1]!.name).toBe('Tail')
    expect(updateRegion(two, 'b', { name: '' })).toBe(two)
    expect(updateRegion(two, 'b', { from: 600 })).toBe(two)
    expect(updateRegion(two, 'nope', { from: 5 })).toBe(two)
  })

  it('removes one, and adds none at the limit', () => {
    expect(removeRegion(two, 'a').regions).toEqual([{ id: 'b', from: 600, to: 800, name: 'Region 1' }])
    const full: SampleInfo = { ...INFO, regions: Array.from({ length: SAMPLE_MARK_LIMITS.regions }, (_, i) => ({ id: `r${i}`, from: i, to: i + 1, name: '' })) }
    expect(addRegion(full, { from: 0, to: 10 })).toBe(full)
  })
})

describe('the loop', () => {
  it('is set from a range, clamped, at least a frame, and cleared with null', () => {
    expect(setLoop(INFO, { from: 200, to: 100 }).loop).toEqual({ from: 100, to: 200 })
    expect(setLoop(INFO, { from: 1000, to: 1000 }).loop).toEqual({ from: 999, to: 1000 })
    const looped = setLoop(INFO, { from: 100, to: 200 })
    expect(setLoop(looped, { from: 100, to: 200 })).toBe(looped)
    expect(setLoop(looped, null)).toEqual(INFO)
    expect(setLoop(INFO, null)).toBe(INFO)
  })

  it('moves an edge as a region does; without a loop, nothing', () => {
    const looped = setLoop(INFO, { from: 100, to: 200 })
    expect(moveLoop(looped, { to: 400 }).loop).toEqual({ from: 100, to: 400 })
    expect(moveLoop(looped, { from: 300 }).loop).toEqual({ from: 199, to: 200 })
    expect(moveLoop(looped, { from: 100 })).toBe(looped)
    expect(moveLoop(INFO, { from: 5 })).toBe(INFO)
  })
})
