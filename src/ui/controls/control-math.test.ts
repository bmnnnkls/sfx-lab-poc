import { describe, expect, it } from 'vitest'
import {
  DRAG_RANGE_PX,
  KNOB_END,
  KNOB_START,
  arcPath,
  clamp01,
  dragPosition,
  knobAngle,
  knobPointer,
  nudge,
  padNudge,
  padPosition,
  trackPosition,
  wheelPosition,
} from './control-math'
import { createFrameThrottle } from './frame-throttle'

describe('clamp01', () => {
  it('limits to 0..1 and treats junk as 0', () => {
    expect(clamp01(-3)).toBe(0)
    expect(clamp01(7)).toBe(1)
    expect(clamp01(0.3)).toBe(0.3)
    expect(clamp01(Number.NaN)).toBe(0)
    expect(clamp01(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('dragPosition', () => {
  it('a full-range drag up goes from the bottom to the top', () => {
    expect(dragPosition(0, DRAG_RANGE_PX)).toBe(1)
    expect(dragPosition(1, -DRAG_RANGE_PX)).toBe(0)
  })
  it('moves proportionally and stops at the ends', () => {
    expect(dragPosition(0.5, DRAG_RANGE_PX / 2)).toBeCloseTo(1, 10)
    expect(dragPosition(0.5, 10 * DRAG_RANGE_PX)).toBe(1)
    expect(dragPosition(0.5, -10 * DRAG_RANGE_PX)).toBe(0)
  })
  it('fine mode is a tenth as sensitive', () => {
    expect(dragPosition(0.2, DRAG_RANGE_PX / 2, true)).toBeCloseTo(0.25, 10)
  })
})

describe('wheelPosition', () => {
  it('scrolling up raises, scrolling down lowers', () => {
    expect(wheelPosition(0.5, -100, 0.02)).toBeCloseTo(0.52, 10)
    expect(wheelPosition(0.5, 100, 0.02)).toBeCloseTo(0.48, 10)
  })
  it('ignores the size of the delta and honours fine mode', () => {
    expect(wheelPosition(0.5, -1, 0.02)).toBe(wheelPosition(0.5, -500, 0.02))
    expect(wheelPosition(0.5, -100, 0.02, true)).toBeCloseTo(0.502, 10)
    expect(wheelPosition(0.5, 0, 0.02)).toBe(0.5)
  })
})

describe('nudge', () => {
  it('moves by a step, ten for the page keys, a tenth with fine', () => {
    expect(nudge(0.5, 'ArrowUp', 0.05)).toBeCloseTo(0.55, 10)
    expect(nudge(0.5, 'ArrowLeft', 0.05)).toBeCloseTo(0.45, 10)
    expect(nudge(0.2, 'PageUp', 0.05)).toBeCloseTo(0.7, 10)
    expect(nudge(0.8, 'PageDown', 0.05)).toBeCloseTo(0.3, 10)
    expect(nudge(0.5, 'ArrowUp', 0.05, true)).toBeCloseTo(0.505, 10)
  })
  it('Home and End go to the ends, other keys are left alone', () => {
    expect(nudge(0.4, 'Home')).toBe(0)
    expect(nudge(0.4, 'End')).toBe(1)
    expect(nudge(0.4, 'a')).toBeUndefined()
    expect(nudge(0.4, 'Tab')).toBeUndefined()
  })
  it('stays inside 0..1', () => {
    expect(nudge(0.99, 'PageUp')).toBe(1)
    expect(nudge(0.01, 'PageDown')).toBe(0)
  })
})

describe('padNudge', () => {
  it('left and right move X only, up and down move Y only', () => {
    expect(padNudge({ x: 0.5, y: 0.5 }, 'ArrowRight', 0.1)).toEqual({ x: 0.6, y: 0.5 })
    expect(padNudge({ x: 0.5, y: 0.5 }, 'ArrowDown', 0.1)).toEqual({ x: 0.5, y: 0.4 })
  })
  it('Home and End are X, Page keys are Y; others are undefined', () => {
    expect(padNudge({ x: 0.5, y: 0.5 }, 'End')).toEqual({ x: 1, y: 0.5 })
    expect(padNudge({ x: 0.5, y: 0.2 }, 'PageUp', 0.01)?.y).toBeCloseTo(0.3, 10)
    expect(padNudge({ x: 0.5, y: 0.5 }, 'Enter')).toBeUndefined()
  })
})

describe('padPosition and trackPosition', () => {
  const box = { left: 100, top: 50, width: 200, height: 100 }
  it('X grows to the right and Y grows upwards', () => {
    expect(padPosition(box, 100, 150)).toEqual({ x: 0, y: 0 })
    expect(padPosition(box, 300, 50)).toEqual({ x: 1, y: 1 })
    expect(padPosition(box, 200, 100)).toEqual({ x: 0.5, y: 0.5 })
  })
  it('sticks to the edge outside the box (a drag may leave the pad)', () => {
    expect(padPosition(box, -500, 9999)).toEqual({ x: 0, y: 0 })
    expect(padPosition(box, 9999, -500)).toEqual({ x: 1, y: 1 })
  })
  it('an empty box gives the origin instead of NaN', () => {
    expect(padPosition({ left: 0, top: 0, width: 0, height: 0 }, 5, 5)).toEqual({ x: 0, y: 0 })
  })
  it('a slider reads one axis of it', () => {
    expect(trackPosition(box, 250, 75, false)).toBe(0.75)
    expect(trackPosition(box, 250, 75, true)).toBe(0.75)
    expect(trackPosition(box, 150, 140, true)).toBeCloseTo(0.1, 10)
  })
})

describe('knob geometry', () => {
  it('sweeps from 7 o\'clock to 5 o\'clock through straight up', () => {
    expect(knobAngle(0)).toBe(KNOB_START)
    expect(knobAngle(1)).toBe(KNOB_END)
    expect(knobAngle(0.5)).toBe(0)
    expect(knobAngle(5)).toBe(KNOB_END)
  })
  it('the pointer points straight up at the middle and sideways a quarter-turn away', () => {
    const [x, y] = knobPointer(24, 24, 10, 0.5)
    expect(x).toBeCloseTo(24, 10)
    expect(y).toBeCloseTo(14, 10)
    const [rx, ry] = knobPointer(24, 24, 10, 0.5 + 90 / 270)
    expect(rx).toBeCloseTo(34, 10)
    expect(ry).toBeCloseTo(24, 10)
  })
  it('draws a small arc as a short sweep and a long one with the large-arc flag', () => {
    expect(arcPath(24, 24, 10, -45, 45)).toMatch(/ 0 0 1 /)
    expect(arcPath(24, 24, 10, KNOB_START, KNOB_END)).toMatch(/ 0 1 1 /)
  })
})

describe('createFrameThrottle', () => {
  const fakeFrames = () => {
    const queue = new Map<number, () => void>()
    let next = 1
    return {
      schedule: (run: () => void) => {
        queue.set(next, run)
        return next++
      },
      unschedule: (handle: number) => void queue.delete(handle),
      tick: () => {
        const runs = [...queue.values()]
        queue.clear()
        for (const run of runs) run()
      },
      pending: () => queue.size,
    }
  }

  it('sends only the last value pushed during a frame', () => {
    const frames = fakeFrames()
    const sent: number[] = []
    const throttle = createFrameThrottle<number>((value) => sent.push(value), frames.schedule, frames.unschedule)
    throttle.push(1)
    throttle.push(2)
    throttle.push(3)
    expect(sent).toEqual([])
    expect(frames.pending()).toBe(1)
    frames.tick()
    expect(sent).toEqual([3])
    throttle.push(4)
    frames.tick()
    expect(sent).toEqual([3, 4])
  })

  it('flush sends the waiting value at once, and the frame then has nothing to do', () => {
    const frames = fakeFrames()
    const sent: number[] = []
    const throttle = createFrameThrottle<number>((value) => sent.push(value), frames.schedule, frames.unschedule)
    throttle.push(7)
    throttle.flush()
    expect(sent).toEqual([7])
    expect(frames.pending()).toBe(0)
    throttle.flush()
    expect(sent).toEqual([7])
  })

  it('cancel drops the waiting value', () => {
    const frames = fakeFrames()
    const sent: number[] = []
    const throttle = createFrameThrottle<number>((value) => sent.push(value), frames.schedule, frames.unschedule)
    throttle.push(1)
    throttle.cancel()
    frames.tick()
    expect(sent).toEqual([])
  })
})
