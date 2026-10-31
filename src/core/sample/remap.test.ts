import { describe, expect, it } from 'vitest'
import { type FrameMap, type FrameRange, type RemapStep, type SampleEdit, SAMPLE_EDITS, inverseStep, mapOf, remapOfSteps } from '.'

/** A small seeded generator, so a failure repeats. */
const random = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2 ** 31
  return seed / 2 ** 31
}

// The closures the edits returned before their maps became data, kept here as the reference.
const kept = (range: FrameRange): FrameRange | null => (range.to > range.from ? range : null)
const OLD = {
  identity: (): FrameMap => ({ identity: true, frame: (p) => p, start: (p) => p, range: (r) => kept(r) }),
  splice: (from: number, to: number, inserted: number): FrameMap => {
    const shift = inserted - (to - from)
    const start = (p: number) => (p < from ? p : p >= to ? p + shift : from + inserted)
    const end = (p: number) => (p <= from ? p : p >= to ? p + shift : from)
    return { identity: shift === 0 && inserted === 0, frame: (p) => (p < from || p >= to ? start(p) : null), start, range: (r) => kept({ from: start(r.from), to: end(r.to) }) }
  },
  crop: (from: number, to: number): FrameMap => {
    const clip = (p: number) => Math.min(to, Math.max(from, p)) - from
    return { identity: false, frame: (p) => (p < from || p > to ? null : p - from), start: clip, range: (r) => kept({ from: clip(r.from), to: clip(r.to) }) }
  },
  mirror: (from: number, to: number): FrameMap => {
    const mirror = (p: number) => (p >= from && p <= to ? from + to - p : p)
    return {
      identity: false,
      frame: mirror,
      start: mirror,
      range: (r) => {
        const [a, b] = [mirror(r.from), mirror(r.to)]
        return kept({ from: Math.min(a, b), to: Math.max(a, b) })
      },
    }
  },
}

const FRAMES = 1000
const copy = (frames: number) => ({ audio: { sampleRate: 1000, channels: [new Float32Array(frames)] }, handles: { before: null, after: null } }) as never
const FADE = { frames: 0, curve: 'linear' } as const

/** Each kind of edit over `range`, with the map it used to return. */
const cases = (range: FrameRange, at: number, inserted: number): Array<{ edit: SampleEdit; old: FrameMap }> => [
  { edit: { kind: 'gain', range, channels: 'both', db: -3, ramp: FADE }, old: OLD.identity() },
  { edit: { kind: 'fade', range, channels: 'both', direction: 'in', curve: 'linear' }, old: OLD.identity() },
  { edit: { kind: 'normalize', range, channels: 'both', peakDb: -1, linked: true }, old: OLD.identity() },
  { edit: { kind: 'reverse', range, channels: 'both' }, old: OLD.mirror(range.from, range.to) },
  { edit: { kind: 'reverse', range, channels: 'left' }, old: OLD.identity() },
  { edit: { kind: 'silence', range, channels: 'both', ramp: FADE }, old: OLD.identity() },
  { edit: { kind: 'dc-offset', range, channels: 'both', ramp: FADE }, old: OLD.identity() },
  { edit: { kind: 'delete', range, crossfade: FADE }, old: OLD.splice(range.from, range.to, 0) },
  { edit: { kind: 'crop', range }, old: OLD.crop(range.from, range.to) },
  { edit: { kind: 'insert', at, insert: copy(inserted), crossfade: FADE }, old: OLD.splice(at, at, inserted) },
  { edit: { kind: 'replace', range, insert: copy(inserted), crossfade: FADE }, old: OLD.splice(range.from, range.to, inserted) },
]

describe('remap steps', () => {
  it('give every edit kind the map it had, for 200 random positions and ranges', () => {
    const next = random(7)
    const whole = () => Math.floor(next() * (FRAMES + 1))
    const kinds = new Set<string>()
    for (let round = 0; round < 20; round++) {
      const [a, b] = [whole(), whole()]
      const range = { from: Math.min(a, b), to: Math.max(a, b) }
      for (const { edit, old } of cases(range, whole(), Math.floor(next() * 300))) {
        kinds.add(edit.kind)
        const map = mapOf((SAMPLE_EDITS[edit.kind].remap as (e: SampleEdit, f: number) => RemapStep | null)(edit, FRAMES))
        expect(map.identity, edit.kind).toBe(old.identity)
        for (let i = 0; i < 10; i++) {
          // Whole frames and fractions (trims), and a few outside the sample.
          const position = i % 2 ? whole() : next() * (FRAMES + 40) - 20
          const [p, q] = [position, next() * FRAMES]
          const span = { from: Math.min(p, q), to: Math.max(p, q) }
          expect(map.frame(position), `${edit.kind} frame ${position}`).toEqual(old.frame(position))
          expect(map.start(position), `${edit.kind} start ${position}`).toEqual(old.start(position))
          expect(map.range(span), `${edit.kind} range`).toEqual(old.range(span))
        }
      }
    }
    expect([...kinds].sort()).toEqual(Object.keys(SAMPLE_EDITS).sort())
  })

  it('run back by their inverse put every surviving position where it was', () => {
    const steps: RemapStep[] = [
      { kind: 'splice', from: 200, to: 400, inserted: 0 },
      { kind: 'splice', from: 300, to: 300, inserted: 150 },
      { kind: 'splice', from: 100, to: 250, inserted: 60 },
      { kind: 'crop', from: 120, to: 700 },
      { kind: 'mirror', from: 30, to: 330 },
    ]
    for (const step of steps) {
      const forward = mapOf(step)
      const back = mapOf(inverseStep(step))
      for (let position = 0; position <= FRAMES; position += 7) {
        const moved = forward.frame(position)
        // A crop keeps its ends (`frame` keeps both boundaries); positions past the kept audio have no place.
        if (moved !== null) expect(back.frame(moved), `${step.kind} ${position}`).toBe(position)
      }
    }
  })

  it('compose in order, with the lengths', () => {
    const remap = remapOfSteps([{ kind: 'splice', from: 0, to: 100, inserted: 0 }, { kind: 'mirror', from: 0, to: 900 }], 1000, 900)
    expect(remap).toMatchObject({ fromFrames: 1000, toFrames: 900, identity: false })
    expect(remap.frame(100)).toBe(900)
    expect(remap.frame(50)).toBeNull()
    expect(remap.range({ from: 50, to: 300 })).toEqual({ from: 700, to: 900 })
    expect(remapOfSteps([], 10, 10).identity).toBe(true)
  })
})
