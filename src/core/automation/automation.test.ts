import { describe, expect, it } from 'vitest'
import { automationPosition, canonicalAutomationPoints, doubleAutomation, duplicateAutomation, setClipAutomation } from './index'
import type { AutomationLane, AutomationPoint } from './types'
import { createClip, createEmptyProject, doubleClip, setClipLength } from '../project'
import { createHistory, commit, undo } from '../history'
const point = (beat: number, value: number, interpolation: 'linear' | 'hold' = 'linear'): AutomationPoint => ({ id: `p${beat}`, beat, value, interpolation })
const target = { kind: 'mixer', owner: { kind: 'track', trackId: 'a' }, control: 'volume' } as const
const lane = (points: readonly AutomationPoint[]): AutomationLane => ({ id: 'lane', enabled: true, target, points })
describe('automation curves and edits', () => {
  it('holds outside points and interpolates normalized values with deterministic equal-time collapse', () => {
    const points = canonicalAutomationPoints([point(2, 1), point(1, 0.4), { ...point(1, 0.2), id: 'last' }, point(8, 2), point(-1, 0), point(NaN, 0)], 4)
    expect(points.map((p) => [p.beat, p.value])).toEqual([[1, 0.2], [2, 1]])
    const l = lane(points)
    expect(automationPosition(l, 0)).toBe(0.2)
    expect(automationPosition(l, 1.5)).toBeCloseTo(0.6)
    expect(automationPosition(l, 4)).toBe(1)
    expect(automationPosition({ ...l, enabled: false }, 2)).toBeUndefined()
    expect(automationPosition(lane([]), 2)).toBeUndefined()
  })
  it('holds discrete and hold segments exactly until the following point', () => {
    const l = lane([point(0, 0), point(1, 1)])
    expect(automationPosition(l, 0.999, true)).toBe(0)
    expect(automationPosition(l, 1, true)).toBe(1)
    expect(automationPosition(lane([point(0, 0, 'hold'), point(1, 1)]), 0.999)).toBe(0)
  })
  it('trims on shorten, preserves the endpoint and restores every point with undo', () => {
    const initial = createEmptyProject(), track = initial.tracks[0]!
    const clip = { ...createClip('clip', 4), automation: [lane([point(0, 0), point(2, 0.5), point(4, 1)])] }
    const project = { ...initial, tracks: [{ ...track, kind: 'instrument' as const, clips: [clip] } as typeof track] }
    const shorter = setClipLength(project, track.id, clip.id, 2)
    const shortTrack = shorter.tracks[0]!
    expect(shortTrack.kind !== 'return' && shortTrack.clips[0]?.automation?.[0]?.points.map((p) => p.beat)).toEqual([0, 2])
    expect(undo(commit(createHistory(project), shorter, { now: 0 })).present).toBe(project)
    expect(doubleClip(project, track.id, clip.id).tracks[0]).not.toEqual(track)
  })
  it('doubling repeats the left limit and wrap without adding a ramp across the join', () => {
    const original = lane([point(1, 0.2), point(3, 0.8)])
    const doubled = doubleAutomation([original], 4)![0]!
    for (const phase of [0, 0.5, 1, 2, 3, 3.5]) {
      expect(automationPosition(doubled, phase)).toBeCloseTo(automationPosition(original, phase)!, 7)
      expect(automationPosition(doubled, phase + 4)).toBeCloseTo(automationPosition(original, phase)!, 7)
    }
    expect(automationPosition(doubled, 4)).toBe(0.2)
  })
  it('duplicates fresh identities, remaps owners, and rejects cross-owner lanes', () => {
    const initial = createEmptyProject(), id = initial.tracks[0]!.id
    const copy = duplicateAutomation([lane([point(0, 0)])], { owners: { a: id } }, initial)![0]!
    expect(copy.id).not.toBe('lane'); expect(copy.points[0]!.id).not.toBe('p0')
    expect(copy.target.owner).toEqual({ kind: 'track', trackId: id })
    const project = { ...initial, tracks: initial.tracks.map((t) => t.kind !== 'instrument' ? t : { ...t, clips: [createClip('clip', 4)] }) }
    const clip = project.tracks[0]!.kind !== 'return' ? project.tracks[0]!.clips[0]! : null
    const next = setClipAutomation(project, id, clip!.id, [lane([])])
    expect(next).toBe(project)
  })
})

it('copies a clip independently and moves its lanes to another track without changing point identities', async () => {
  const { copySessionClip, createTrack } = await import('../project')
  const initial = createEmptyProject(), source = initial.tracks[0]!
  if (source.kind !== 'instrument') throw new Error('instrument')
  const clip = { ...createClip('clip', 4), automation: [{ ...lane([point(0, 0)]), target: { ...target, owner: { kind: 'track' as const, trackId: source.id } } }] }
  const destination = createTrack('Destination', initial.sceneCount)
  const project = { ...initial, tracks: [{ ...source, clips: [clip, null, null, null] }, destination] }
  const copied = copySessionClip(project, source.id, clip.id, source.id, 1)
  const t = copied.tracks[0]!
  if (t.kind !== 'instrument') throw new Error('instrument')
  expect(t.clips[1]?.id).not.toBe(clip.id)
  expect(t.clips[1]?.automation?.[0]?.points[0]?.id).not.toBe(clip.automation[0]!.points[0]!.id)
  expect(t.clips[1]?.automation?.[0]?.target).toEqual(clip.automation[0]!.target)
  const moved = copySessionClip(project, source.id, clip.id, destination.id, 0, true)
  const dest = moved.tracks[1]!, from = moved.tracks[0]!
  expect(from.kind !== 'return' && from.clips[0]).toBeNull()
  expect(dest.kind !== 'return' && dest.clips[0]?.id).toBe(clip.id)
  expect(dest.kind !== 'return' && dest.clips[0]?.automation?.[0]?.target.owner).toEqual({ kind: 'track', trackId: destination.id })
  expect(dest.kind !== 'return' && dest.clips[0]?.automation?.[0]?.points).toEqual(clip.automation[0]!.points)
})

it('refuses to double beyond the saved point limit and keeps no-op lane edits out of history', () => {
  const initial = createEmptyProject(), t = initial.tracks[0]!
  if (t.kind !== 'instrument') throw new Error('instrument')
  const clip = { ...createClip('clip', 4), automation: [{ ...lane(Array.from({ length: 1024 }, (_, i) => point(i / 1024 * 4, 0))), target: { ...target, owner: { kind: 'track' as const, trackId: t.id } } }] }
  const project = { ...initial, tracks: [{ ...t, clips: [clip] }] }
  expect(doubleClip(project, t.id, clip.id)).toBe(project)
  expect(setClipAutomation(project, t.id, clip.id, clip.automation)).toBe(project)
})
