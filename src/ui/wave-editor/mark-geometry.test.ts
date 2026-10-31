import { describe, expect, it } from 'vitest'
import { type Marks, markAt, markEdgeAt, markLines } from './mark-geometry'

/** One frame per column, so x is the frame. */
const VIEW = { startFrame: 0, framesPerPixel: 1, width: 1000 }
const MARKS: Marks = {
  markers: [{ id: 'm', frame: 300, name: 'Hit' }],
  regions: [
    { id: 'wide', from: 100, to: 600, name: 'Wide' },
    { id: 'narrow', from: 250, to: 350, name: 'Narrow' },
  ],
  loop: { from: 700, to: 900 },
}

describe('markAt', () => {
  it.each([
    { what: 'a marker within 4 px, over the regions it is in', x: 303, hit: { kind: 'marker', id: 'm' } },
    { what: 'the shortest region under the pointer', x: 270, hit: { kind: 'region', id: 'narrow' } },
    { what: 'the region it is in', x: 150, hit: { kind: 'region', id: 'wide' } },
    { what: 'a loop edge', x: 703, hit: { kind: 'loop' } },
    { what: 'inside the loop', x: 800, hit: { kind: 'loop' } },
    { what: 'nothing', x: 50, hit: null },
  ])('finds $what', ({ x, hit }) => {
    expect(markAt(VIEW, MARKS, x)).toEqual(hit)
  })

  it('reads the view: zoomed out, a marker is reached from further in frames', () => {
    expect(markAt({ ...VIEW, framesPerPixel: 10 }, MARKS, 30.3)).toEqual({ kind: 'marker', id: 'm' })
    expect(markAt({ ...VIEW, startFrame: 280 }, MARKS, 20)).toEqual({ kind: 'marker', id: 'm' })
  })
})

describe('markEdgeAt', () => {
  it('finds the nearest region or loop edge within EDGE_PX, and none between', () => {
    expect(markEdgeAt(VIEW, MARKS, 252)).toEqual({ kind: 'region', id: 'narrow', edge: 'from' })
    expect(markEdgeAt(VIEW, MARKS, 597)).toEqual({ kind: 'region', id: 'wide', edge: 'to' })
    expect(markEdgeAt(VIEW, MARKS, 898)).toEqual({ kind: 'loop', edge: 'to' })
    expect(markEdgeAt(VIEW, MARKS, 450)).toBeNull()
  })

  it('takes the loop first where its edge meets a region\'s', () => {
    const meeting: Marks = { ...MARKS, loop: { from: 600, to: 900 } }
    expect(markEdgeAt(VIEW, meeting, 600)).toEqual({ kind: 'loop', edge: 'from' })
  })
})

describe('markLines', () => {
  it('puts a line at each marker, and faint ones at region and loop edges, in view', () => {
    expect(markLines({ ...VIEW, width: 650 }, MARKS)).toEqual({ markers: [300], edges: [100, 600, 250, 350] })
  })
})
