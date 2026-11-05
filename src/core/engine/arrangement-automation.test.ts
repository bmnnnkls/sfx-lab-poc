import { describe, expect, it } from 'vitest'
import {
  type AutomationLane,
  type ControlOwner,
  type ControlTarget,
  type InstrumentTrack,
  type PlaybackLane,
  type Project,
  type TimelineRegionLanes,
  compileTimelineAutomation,
  createArrangementClip,
  createClip,
  createEmptyProject,
  createNote,
  createReturnTrack,
  diffProject,
  noteGraphFrom,
  renderProject,
  setGroupBus,
  setTimelineLanes,
} from '../index'
import { ArrangementAutomation } from './arrangement-automation'
import { Engine } from './engine'

// ---------------------------------------------------------------------------------------------------------------
// Which lane plays: the pure table.

const target = (trackId: string, control: 'volume' | 'pan' = 'volume'): ControlTarget => ({ kind: 'mixer', owner: { kind: 'track', trackId }, control })
const playback = (id: string, on: ControlTarget, beats: readonly number[] = [0], enabled = true): PlaybackLane => ({
  id,
  target: on,
  enabled,
  points: beats.map((beat, i) => ({ id: `${id}${i}`, beat, value: 0.5, interpolation: 'linear' })),
  spec: {} as PlaybackLane['spec'],
  baseValue: 0,
  discrete: false,
})
const region = (trackId: string, start: number, end: number, length: number, lanes: readonly PlaybackLane[]): TimelineRegionLanes => ({ trackId, start, end, length, lanes })

const playingAt = (automation: ArrangementAutomation, beat: number) => {
  const seen: [string, number][] = []
  automation.lanesAt(beat, (lane, at) => seen.push([lane.id, Math.round(at * 1e6) / 1e6]))
  return seen
}

describe('which lane plays on the timeline', () => {
  const regionLane = playback('region', target('A'))
  const setup = (owners: readonly PlaybackLane[], regions: readonly TimelineRegionLanes[]) => {
    const automation = new ArrangementAutomation()
    automation.configure({ owners: owners.map((lane) => ({ owner: lane.target.owner, lanes: [lane] })), regions })
    return automation
  }

  it.each([
    ['a timeline lane with points wins over the region', [playback('timeline', target('A'))], [['timeline', 5]]],
    ['an empty timeline lane leaves the region', [playback('timeline', target('A'), [])], [['timeline', 5], ['region', 1]]],
    ['a disabled timeline lane leaves the region', [playback('timeline', target('A'), [0], false)], [['timeline', 5], ['region', 1]]],
    ['another target plays beside the region', [playback('timeline', target('A', 'pan'))], [['timeline', 5], ['region', 1]]],
  ] as const)('%s', (_, owners, expected) => {
    expect(playingAt(setup(owners, [region('A', 4, 8, 4, [regionLane])]), 5)).toEqual(expected)
  })

  it('takes the newest region under the beat, then the older one where the newer has ended', () => {
    const automation = setup([], [region('A', 0, 16, 16, [playback('old', target('A'))]), region('A', 4, 8, 4, [playback('new', target('A'))])])
    expect(playingAt(automation, 2)).toEqual([['old', 2]])
    expect(playingAt(automation, 5)).toEqual([['new', 1]])
    expect(playingAt(automation, 9)).toEqual([['old', 9]])
  })

  it("follows a looping region's phase up to its loop end, and nothing after it", () => {
    const automation = setup([], [region('A', 4, 10, 2, [regionLane])])
    expect(playingAt(automation, 3.9)).toEqual([])
    expect(playingAt(automation, 4)).toEqual([['region', 0]])
    expect(playingAt(automation, 7.5)).toEqual([['region', 1.5]])
    expect(playingAt(automation, 9.75)).toEqual([['region', 1.75]])
    expect(playingAt(automation, 10)).toEqual([])
    // A jump back finds the region again.
    expect(playingAt(automation, 5)).toEqual([['region', 1]])
  })

  it('keeps tracks apart', () => {
    const automation = setup([], [region('A', 0, 4, 4, [playback('a', target('A'))]), region('B', 2, 6, 4, [playback('b', target('B'))])])
    expect(playingAt(automation, 3)).toEqual([['a', 3], ['b', 1]])
    expect(playingAt(automation, 5)).toEqual([['b', 3]])
  })

  it('answers no constant range across a region edge or a wrap', () => {
    const automation = setup([], [region('A', 4, 10, 2, [regionLane])])
    const ranges = (from: number, to: number) => { const seen: (readonly [number, number] | null)[] = []; automation.lanesIn(from, to, (_, range) => seen.push(range)); return seen }
    expect(ranges(4.5, 5)).toEqual([[0.5, 1]])
    expect(ranges(5.5, 6.5)).toEqual([null])
    expect(ranges(3.5, 4.5)).toEqual([null])
    expect(ranges(9.5, 10.5)).toEqual([null])
  })
})

// ---------------------------------------------------------------------------------------------------------------
// The engine: a held note through track S, in group G with a bus, into the master. The note graph's gate is a steady
// 1 while the note is held, so the output is the product of the faders (through the soft clip).

const RATE = 8000
const BEAT = RATE / 2 // 120 BPM
const S: ControlOwner = { kind: 'track', trackId: 'S' }
const G: ControlOwner = { kind: 'group', groupId: 'G' }
const M: ControlOwner = { kind: 'master' }
const volume = (owner: ControlOwner): ControlTarget => ({ kind: 'mixer', owner, control: 'volume' })
const lane = (owner: ControlOwner, points: readonly [number, number, 'linear' | 'hold'][], id = `lane-${owner.kind}`): AutomationLane => ({
  id,
  target: volume(owner),
  enabled: true,
  points: points.map(([beat, value, interpolation], i) => ({ id: `${id}-${i}`, beat, value, interpolation })),
})

const base = (): Project => {
  const p = createEmptyProject()
  const t = p.tracks[0] as InstrumentTrack
  const source: InstrumentTrack = {
    ...t,
    id: 'S',
    volume: 0.5,
    groupId: 'G',
    patch: noteGraphFrom([{ id: 'note', type: 'note' }, { id: 'out', type: 'output' }], ['note.gate>out.in']),
    clips: t.clips.map(() => null),
  }
  const project: Project = {
    ...p,
    tempo: 120,
    master: { ...p.master, volume: 1 },
    groups: [{ id: 'G', name: 'G', colour: 'red' }],
    tracks: [source],
    // One region holding a note for 32 beats, so the source sounds the whole time.
    arrangement: [createArrangementClip('S', 0, { ...createClip('Held', 32, [createNote(60, 0, 32, 1)]), id: 'held' })],
  }
  return setGroupBus(project, 'G', true)
}

const engineFor = (project: Project, fromBeat = 0) => {
  const engine = new Engine(RATE)
  diffProject(null, project).forEach((command) => engine.apply(command))
  engine.apply({ type: 'arrangement/play', fromBeat })
  return engine
}
const render = (engine: Engine, frames: number, chunk = 128) => {
  const out = new Float32Array(frames)
  for (let i = 0; i < frames; i += chunk) {
    const left = new Float32Array(Math.min(chunk, frames - i))
    engine.render(left, new Float32Array(left.length))
    out.set(left, i)
  }
  return out
}
const readout = (engine: Engine, on: ControlTarget) => engine.status().automation?.find((entry) => JSON.stringify(entry.target) === JSON.stringify(on))?.value
const configured = (engine: Engine) => (engine as unknown as { automation: { configured: boolean } }).automation.configured
const maxDiff = (a: Float32Array, b: Float32Array) => a.reduce((worst, value, i) => Math.max(worst, Math.abs(value - b[i]!)), 0)

describe('the engine plays timeline lanes in arrangement mode', () => {
  it("writes a group bus's fader from its timeline lane, as the same value set by hand would", () => {
    const automated = engineFor(setTimelineLanes(base(), G, [lane(G, [[0, 0.25, 'hold']])]))
    const out = render(automated, BEAT * 2)
    const value = readout(automated, volume(G))!
    expect(value).toBeGreaterThan(0)
    const project = base()
    const fixed = engineFor({ ...project, groups: project.groups!.map((group) => ({ ...group, bus: { ...group.bus!, volume: value } })) })
    expect(maxDiff(out, render(fixed, BEAT * 2))).toBeLessThan(1e-6)
    expect(Math.abs(out[BEAT]!)).toBeGreaterThan(0.01)
  })

  it("writes a group bus's pan and a send from timeline lanes", () => {
    const pan: ControlTarget = { kind: 'mixer', owner: G, control: 'pan' }
    const project = base()
    const lanes = [{ ...lane(G, [[0, 1, 'hold']], 'pan'), target: pan }]
    const engine = engineFor(setTimelineLanes(project, G, lanes))
    const left = new Float32Array(BEAT), right = new Float32Array(BEAT)
    engine.render(left, right)
    expect(readout(engine, pan)).toBeDefined()
    // Panned hard right: the left side falls well below the right.
    expect(Math.abs(left[BEAT - 1]!)).toBeLessThan(Math.abs(right[BEAT - 1]!) * 0.1)
    const send: ControlTarget = { kind: 'mixer', owner: G, control: 'send', returnId: 'R' }
    const withReturn: Project = { ...project, tracks: [...project.tracks, { ...createReturnTrack('R'), id: 'R' }] }
    const sending = engineFor(setTimelineLanes(withReturn, G, [{ ...lane(G, [[0, 0.5, 'hold']], 'send'), target: send }]))
    render(sending, BEAT)
    expect(readout(sending, send)).toBeGreaterThan(0)
  })

  it('plays nothing from the timeline in session mode, and restores the base on switching', () => {
    const project = setTimelineLanes(base(), M, [lane(M, [[0, 0.1, 'hold']])])
    const engine = engineFor(project)
    render(engine, BEAT)
    expect(readout(engine, volume(M))).toBeDefined()
    engine.apply({ type: 'transport/play' })
    render(engine, BEAT)
    expect(readout(engine, volume(M))).toBeUndefined()
    expect(configured(engine)).toBe(false)
  })

  it("plays a region's own lanes inside it, and the base after it", () => {
    const project = base()
    const region = createArrangementClip('S', 4, { ...createClip('Swell', 4, []), id: 'swell', automation: [lane(S, [[0, 0, 'linear'], [4, 1, 'linear']], 'swell')] })
    const engine = engineFor({ ...project, arrangement: [...project.arrangement!, region] })
    render(engine, BEAT * 3)
    expect(readout(engine, volume(S))).toBeUndefined()
    render(engine, BEAT * 3)
    const inside = readout(engine, volume(S))
    expect(inside).toBeDefined()
    render(engine, BEAT * 3)
    expect(readout(engine, volume(S))).toBeUndefined()
  })

  it("a timeline lane with points takes the control from a region's lane on the same target", () => {
    const project = base()
    const region = createArrangementClip('S', 0, { ...createClip('Swell', 4, []), id: 'swell', automation: [lane(S, [[0, 1, 'hold']], 'swell')] })
    const both = setTimelineLanes({ ...project, arrangement: [...project.arrangement!, region] }, S, [lane(S, [[0, 0.3, 'hold']], 'timeline')])
    const timelineOnly = setTimelineLanes(project, S, [lane(S, [[0, 0.3, 'hold']], 'timeline')])
    const a = engineFor(both), b = engineFor(timelineOnly)
    expect(maxDiff(render(a, BEAT * 2), render(b, BEAT * 2))).toBeLessThan(1e-7)
  })

  it('gives the same output at any block size, with a region edge inside a block', () => {
    const project = base()
    const region = createArrangementClip('S', 1.37, { ...createClip('Dip', 1, []), id: 'dip', automation: [lane(S, [[0, 0.1, 'linear'], [1, 0.9, 'linear']], 'dip')] })
    const withRegion = setTimelineLanes({ ...project, arrangement: [...project.arrangement!, region] }, G, [lane(G, [[0, 0.2, 'linear'], [3, 0.8, 'linear']])])
    const reference = render(engineFor(withRegion), BEAT * 3, 128)
    for (const chunk of [1, 97, 4096]) expect(maxDiff(render(engineFor(withRegion), BEAT * 3, chunk), reference)).toBeLessThan(1e-6)
  })

  it('restores the base when a lane is deleted while it plays', () => {
    const project = setTimelineLanes(base(), G, [lane(G, [[0, 0.1, 'hold']])])
    const engine = engineFor(project)
    render(engine, BEAT)
    expect(readout(engine, volume(G))).toBeDefined()
    engine.apply({ type: 'automation/configure', tracks: [], timeline: compileTimelineAutomation(base()) })
    const after = render(engine, BEAT)
    const plain = engineFor(base())
    render(plain, BEAT)
    expect(maxDiff(after.subarray(BEAT / 2), render(plain, BEAT).subarray(BEAT / 2))).toBeLessThan(1e-6)
    expect(readout(engine, volume(G))).toBeUndefined()
  })

  it("re-evaluates at the loop's jump", () => {
    const project = setTimelineLanes(base(), M, [lane(M, [[0, 0, 'linear'], [8, 1, 'linear']])])
    const engine = engineFor({ ...project, arrangementLoop: { from: 2, to: 4, enabled: true } })
    render(engine, BEAT * 3.9)
    const beforeJump = readout(engine, volume(M))!
    render(engine, BEAT * 0.2)
    expect(engine.status().beat).toBeLessThan(2.5)
    expect(readout(engine, volume(M))!).toBeLessThan(beforeJump)
  })

  it('keeps the fast path with nothing on the timeline', () => {
    const engine = engineFor(base())
    render(engine, 256)
    expect(configured(engine)).toBe(false)
  })

  it('bounces as it plays', () => {
    const region = createArrangementClip('S', 2, { ...createClip('Swell', 2, []), id: 'swell', automation: [lane(S, [[0, 0.2, 'linear'], [2, 0.9, 'linear']], 'swell')] })
    const project = setTimelineLanes({ ...base(), arrangement: [...base().arrangement!, region] }, G, [lane(G, [[0, 0.3, 'linear'], [6, 0.7, 'hold']])])
    const bounce = renderProject(project, [], { scope: { kind: 'arrangement' }, sampleRate: 48000, maxTail: 0 })
    const engine = new Engine(48000)
    diffProject(null, project).forEach((command) => engine.apply(command))
    engine.apply({ type: 'arrangement/setLoop', loop: null })
    engine.apply({ type: 'arrangement/play', fromBeat: 0 })
    const live = render(engine, 48000 * 4, 4096)
    expect(maxDiff(bounce.left.subarray(0, live.length), live)).toBeLessThan(1e-6)
  })
})
