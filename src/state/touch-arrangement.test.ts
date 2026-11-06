import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type ClockPosition, type ControlOwner, type ControlTarget, type EngineStatus, type Project, Engine, addTrack, automationPosition, createArrangementClip, createAudioTrack, createClip, createDemoProject, createReturnTrack, createTrack, diffProject, setGroupBus, timelineLanesOf, timelineLanesOpen } from '@core'
import { useControlStore } from './control-store'
import { useProjectStore } from './project-store'
import { useStatusStore } from './status-store'
import { cancelTouches, captureTouch, finishTouch, finishTouches, reconcileTouches, setTouchClock, touchBeatNow, touchDestination, touchPositionNow, useTouchStore } from './touch-store'

const track = (trackId: string): ControlOwner => ({ kind: 'track', trackId })
const group = (groupId: string): ControlOwner => ({ kind: 'group', groupId })
const master: ControlOwner = { kind: 'master' }
const volume = (owner: ControlOwner): ControlTarget => ({ kind: 'mixer', owner, control: 'volume' })
const pan = (owner: ControlOwner): ControlTarget => ({ kind: 'mixer', owner, control: 'pan' })

/** Instrument track A in group G (a bus), audio track U, B in folder F, a return R; clip `c` on A. */
const fixture = (): Project => {
  let project: Project = { ...createDemoProject(), tracks: [], groups: undefined, arrangement: [], arrangementAutomation: undefined }
  project = addTrack(project, { ...createTrack('A', 4), id: 'A', volume: 0.5, clips: [{ ...createClip('C', 4), id: 'c' }] })
  project = addTrack(project, { ...createAudioTrack('U', 4), id: 'U' })
  project = addTrack(project, { ...createTrack('B', 4), id: 'B' })
  project = addTrack(project, { ...createReturnTrack('R'), id: 'R' })
  project = {
    ...project,
    groups: [{ id: 'G', name: 'G', colour: 'red' }, { id: 'F', name: 'F', colour: 'blue' }],
    tracks: project.tracks.map((t) => (t.id === 'A' ? { ...t, groupId: 'G' } : t.id === 'B' ? { ...t, groupId: 'F' } : t)),
  }
  return setGroupBus(project, 'G', true)
}

let position: ClockPosition = { beat: 0, lap: 0, run: 1 }
let status: EngineStatus
const engineStatus = new Engine(8000).status()
/** The transport at `beat`, as the clock and then the status see it; the status reconciles first, as project-sync does. */
const at = (beat: number, lap = 0, run = 1, mode: EngineStatus['mode'] = 'arrangement') => {
  position = { beat, lap, run }
  status = { ...engineStatus, playing: true, mode, beat, lap, run }
  reconcileTouches(status)
  useStatusStore.setState({ status })
}
const touch = (source: string, target: ControlTarget, value: number) => captureTouch(source, [{ target, value }])
const lane = (owner: ControlOwner, target = volume(owner)) => {
  const found = timelineLanesOf(useProjectStore.getState().project, owner).find((l) => l.target.kind === target.kind && 'control' in l.target && 'control' in target && l.target.control === target.control)
  return (beat: number) => (found ? automationPosition(found, beat) : undefined)
}
const past = () => useProjectStore.getState().history.past.length
const feedback = () => useTouchStore.getState().feedback
const setProject = (project: Project) => useProjectStore.setState({ project })

beforeEach(() => {
  useProjectStore.getState().resetProject(fixture())
  setTouchClock(() => position)
  at(0)
  useTouchStore.getState().arm(true)
})
afterEach(() => { cancelTouches(); setTouchClock(); useControlStore.getState().clear(); useStatusStore.setState({ status: null, audioFailure: null }) })

describe('the touch clock', () => {
  it('reads positions from the audio clock, and a beat-only reader takes the status run and loop pass', () => {
    useStatusStore.setState({ status: { ...engineStatus, playing: true, beat: 5, run: 3, lap: 2 } })
    setTouchClock((ago = 0) => ({ beat: 9 - ago / 1000, lap: 1, run: 4 }))
    expect(touchPositionNow()).toEqual({ beat: 9, lap: 1, run: 4 })
    expect(touchBeatNow(1000)).toBe(8)
    setTouchClock((ago = 0) => 7 - ago / 1000)
    expect(touchPositionNow()).toEqual({ beat: 7, lap: 2, run: 3 })
    expect(touchBeatNow(500)).toBe(6.5)
    setTouchClock(() => undefined)
    expect(touchPositionNow()).toBeUndefined()
    setTouchClock()
    expect(touchPositionNow()).toEqual({ beat: 5, lap: 2, run: 3 })
  })
})

describe('where a take goes', () => {
  it('is the playing clip in the Session and the owner\'s timeline in the Arrangement; a folder has neither', () => {
    const project = { ...fixture(), arrangementLoop: { from: 4, to: 8, enabled: true } }
    const session = { ...engineStatus, playing: true, mode: 'session' as const, tracks: { A: { playingClipId: 'c', startBeat: 0, queued: null } } }
    expect(touchDestination(project, volume(track('A')), session)).toMatchObject({ kind: 'clip', start: 0, clip: { id: 'c' } })
    for (const owner of [track('U'), track('R'), master, group('G'), group('F')]) expect(touchDestination(project, volume(owner), session)).toBeUndefined()
    const arrangement = { ...engineStatus, playing: true, mode: 'arrangement' as const, run: 7 }
    for (const owner of [track('A'), track('U'), track('R'), master, group('G')]) expect(touchDestination(project, volume(owner), arrangement)).toEqual({ kind: 'timeline', owner, brace: { from: 4, to: 8 }, run: 7 })
    expect(touchDestination(project, volume(group('F')), arrangement)).toBeUndefined()
    expect(touchDestination(fixture(), volume(master), arrangement)).toEqual({ kind: 'timeline', owner: master, run: 7 })
    expect(touchDestination(project, volume(master), { ...arrangement, playing: false })).toBeUndefined()
  })
  it('a folder\'s control says why and authors its base', () => {
    at(1)
    expect(touch('a', volume(group('F')), 0.3)).toBe(false)
    expect(feedback()).toBe('Touch unavailable: a folder has no lanes (give the group a bus)')
  })
})

describe('a take on the timeline', () => {
  it('with the loop off: song beats, one undo step, the lanes opened without one', () => {
    const before = past()
    at(2); touch('a', volume(track('A')), 0.9)
    expect(feedback()).toBe('Touch → timeline')
    expect(useTouchStore.getState().recording).toHaveLength(1)
    at(3); touch('a', volume(track('A')), 0.2)
    at(4); finishTouch('a')
    const value = lane(track('A'))
    expect(value(1)).toBeCloseTo(0.5)
    expect(value(2)).toBeCloseTo(0.9)
    expect(value(3.5)).toBeCloseTo(0.2)
    expect(value(4.5)).toBeCloseTo(0.5)
    expect(feedback()).toBe('Touch take saved to the timeline')
    expect(useControlStore.getState().overrides).toEqual([])
    expect(past()).toBe(before + 1)
    expect(timelineLanesOpen(useProjectStore.getState().project, track('A'))).toBe(true)
    useProjectStore.getState().undo()
    expect(timelineLanesOf(useProjectStore.getState().project, track('A'))).toEqual([])
    expect(timelineLanesOpen(useProjectStore.getState().project, track('A'))).toBe(true)
  })
  it('over three loop passes: each replaces its touched part, the last wins', () => {
    setProject({ ...useProjectStore.getState().project, arrangementLoop: { from: 4, to: 8, enabled: true } })
    at(5); touch('a', volume(group('G')), 0.2); at(7.9); touch('a', volume(group('G')), 0.2)
    at(4.1, 1); touch('a', volume(group('G')), 0.6); at(7.9, 1); touch('a', volume(group('G')), 0.6)
    at(4.1, 2); touch('a', volume(group('G')), 0.8); at(6, 2); finishTouch('a', position)
    const value = lane(group('G'))
    expect(value(3)).toBeCloseTo(1)
    expect(value(5)).toBeCloseTo(0.8)
    expect(value(7)).toBeCloseTo(0.6)
    expect(value(9)).toBeCloseTo(1)
    expect(timelineLanesOf(useProjectStore.getState().project, group('G'))[0]!.points.every((p) => p.beat <= 8 + 1e-6)).toBe(true)
  })
  it('begun before the brace: one take, the part before it straight and the rest by passes', () => {
    setProject({ ...useProjectStore.getState().project, arrangementLoop: { from: 4, to: 8, enabled: true } })
    const before = past()
    at(2); touch('a', volume(master), 0.3); at(7.9); touch('a', volume(master), 0.3)
    at(4.1, 1); touch('a', volume(master), 0.9); at(5, 1); finishTouch('a', position)
    const value = lane(master)
    expect(value(1)).toBeCloseTo(1)
    expect(value(3)).toBeCloseTo(0.3)
    expect(value(4.5)).toBeCloseTo(0.9)
    expect(value(6)).toBeCloseTo(0.3)
    expect(value(9)).toBeCloseTo(1)
    expect(past()).toBe(before + 1)
  })
  it('ends at ■ where the transport is', () => {
    at(2); touch('a', volume(track('R')), 0.1)
    at(6); finishTouches()
    const value = lane(track('R'))
    expect(value(5.9)).toBeCloseTo(0.1)
    expect(value(6.1)).toBeCloseTo(0.8)
  })
  it.each([
    ['a seek', () => at(10, 0, 2), 'Touch take saved; the transport jumped'],
    ['a brace change', () => { setProject({ ...useProjectStore.getState().project, arrangementLoop: { from: 0, to: 16, enabled: true } }); at(3.5) }, 'Touch take saved; the loop changed'],
    ['a switch to the Session', () => at(3.5, 0, 2, 'session'), 'Touch take saved; playback switched'],
  ])('ends at its last sample on %s', (_, happen, said) => {
    at(2); touch('a', volume(track('U')), 0.1); at(3); touch('a', volume(track('U')), 0.1)
    happen()
    expect(useTouchStore.getState().recording).toEqual([])
    expect(feedback()).toBe(said)
    const value = lane(track('U'))
    expect(value(2.9)).toBeCloseTo(0.1)
    expect(value(3.2)).not.toBeCloseTo(0.1)
  })
  it('ends at its last sample when the next sample comes from after a seek, and records on from there', () => {
    at(2); touch('a', volume(track('A')), 0.1); at(3); touch('a', volume(track('A')), 0.1)
    position = { beat: 12, lap: 0, run: 2 }
    touch('a', volume(track('A')), 0.7)
    expect(useTouchStore.getState().recording).toHaveLength(1)
    expect(lane(track('A'))(3.2)).not.toBeCloseTo(0.1)
    position = { beat: 13, lap: 0, run: 2 }; finishTouch('a')
    expect(lane(track('A'))(12.5)).toBeCloseTo(0.7)
  })
  it('is discarded when its owner goes (the bus switched off)', () => {
    const before = past()
    at(2); touch('a', volume(group('G')), 0.1)
    setProject(setGroupBus(useProjectStore.getState().project, 'G', false))
    at(3)
    expect(feedback()).toBe('Touch destination changed; take discarded')
    expect(past()).toBe(before)
    expect(useControlStore.getState().overrides).toEqual([])
  })
  it('refuses a 65th lane, and a take past 2048 points whole', () => {
    const cc = Array.from({ length: 64 }, (_, i) => ({ id: `cc${i}`, target: { kind: 'expression' as const, owner: track('A'), control: 'cc' as const, cc: i + 1 }, enabled: true, points: [] }))
    setProject({ ...useProjectStore.getState().project, arrangementAutomation: [{ owner: track('A'), lanes: cc }] })
    at(2); expect(touch('a', volume(track('A')), 0.3)).toBe(false)
    expect(feedback()).toBe('Touch unavailable: 64 lane limit')
    const full = { id: 'full', target: volume(master), enabled: true, points: Array.from({ length: 2048 }, (_, i) => ({ id: `p${i}`, beat: i, value: i % 2, interpolation: 'linear' as const })) }
    setProject({ ...useProjectStore.getState().project, arrangementAutomation: [{ owner: master, lanes: [full] }] })
    const project = useProjectStore.getState().project
    at(9.2); touch('a', volume(master), 0.5); at(9.4); touch('a', volume(master), 0.9); at(9.6); finishTouch('a')
    expect(feedback()).toContain('2048')
    expect(useProjectStore.getState().project).toBe(project)
  })
  it('two sources on two targets are a step each; a competing source is refused', () => {
    const before = past()
    at(2); touch('a', volume(track('A')), 0.1); touch('b', pan(group('G')), 0.9)
    expect(touch('c', volume(track('A')), 0.4)).toBe(true)
    expect(feedback()).toBe('Touch unavailable: another source is touching this control')
    at(3); finishTouch('a'); expect(useTouchStore.getState().recording).toHaveLength(1)
    finishTouch('b')
    expect(past()).toBe(before + 2)
    expect(lane(track('A'))(2.5)).toBeCloseTo(0.1)
    // Pan −1 to 1 is 0 to 1 normalized.
    expect(lane(group('G'), pan(group('G')))(2.5)).toBeCloseTo(0.95)
  })
  it('stops at 256 beats of take time, across loop passes', () => {
    setProject({ ...useProjectStore.getState().project, arrangementLoop: { from: 0, to: 4, enabled: true } })
    at(1); touch('a', volume(master), 0.3)
    at(1.5, 64)
    expect(useTouchStore.getState().recording).toEqual([])
    expect(feedback()).toBe('Touch limit reached; take finished')
    expect(lane(master)(3)).toBeCloseTo(0.3)
  })
  it('a session take ends at its last sample when the Arrangement starts', () => {
    const session = (beat: number) => { position = { beat, lap: 0, run: 1 }; status = { ...engineStatus, playing: true, mode: 'session', beat, run: 1, tracks: { A: { playingClipId: 'c', startBeat: 0, queued: null } } }; reconcileTouches(status); useStatusStore.setState({ status }) }
    session(1); touch('a', volume(track('A')), 0.1); session(2); touch('a', volume(track('A')), 0.1)
    at(9, 0, 2)
    expect(feedback()).toBe('Touch take saved; playback switched')
    const clip = (useProjectStore.getState().project.tracks.find((t) => t.id === 'A') as { clips: readonly ({ automation?: readonly Parameters<typeof automationPosition>[0][] } | null)[] }).clips[0]!.automation![0]!
    expect(automationPosition(clip, 1.5)).toBeCloseTo(0.1)
    expect(automationPosition(clip, 2.5)).toBeCloseTo(0.5)
    expect(timelineLanesOf(useProjectStore.getState().project, track('A'))).toEqual([])
  })
  it("warns when it replaces a region's own lane on the control", () => {
    const content = { ...createClip('C', 4), automation: [{ id: 'r', target: volume(track('A')), enabled: true, points: [{ id: 'p', beat: 0, value: 0.2, interpolation: 'linear' as const }] }] }
    setProject({ ...useProjectStore.getState().project, arrangement: [{ ...createArrangementClip('A', 8, content), id: 'region' }] })
    at(2); touch('a', volume(track('A')), 0.1); at(3); finishTouch('a')
    expect(feedback()).toBe("Touch take saved to the timeline · replaces the region's lane on this control")
  })
})

describe("with the engine's own clock", () => {
  it('a take across a loop jump lands in the brace', () => {
    const project = { ...fixture(), tempo: 120, arrangementLoop: { from: 0, to: 2, enabled: true } }
    useProjectStore.getState().resetProject(project); useTouchStore.getState().arm(true)
    const engine = new Engine(8000)
    for (const command of diffProject(null, project, false)) engine.apply(command)
    engine.apply({ type: 'arrangement/play', fromBeat: 0 })
    setTouchClock(() => { const { beat, lap, run } = engine.clock(); return { beat, lap: lap ?? 0, run: run ?? 0 } })
    const step = (seconds: number) => {
      for (let left = Math.round(seconds * 8000); left > 0; left -= 128) engine.render(new Float32Array(Math.min(128, left)), new Float32Array(Math.min(128, left)))
      const next = engine.status(); reconcileTouches(next); useStatusStore.setState({ status: next })
    }
    step(0.5); touch('a', volume(master), 0.2)
    step(0.4); touch('a', volume(master), 0.2)
    step(0.35); touch('a', volume(master), 0.7)
    expect(engine.status().lap).toBe(1)
    step(0.2); finishTouch('a')
    const value = lane(master)
    expect(value(0.75)).toBeCloseTo(0.7)
    expect(value(1.5)).toBeCloseTo(0.2)
  })
})
