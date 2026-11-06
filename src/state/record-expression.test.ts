import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type AutomationLane, type EngineStatus, type ExpressionControl, type InstrumentTrack, type LauncherStatus, type Project, addTrack, automationPosition, createClip, createEmptyProject, createTrack, serializeProject, setClipAt } from '@core'
import { useProjectStore } from './project-store'
import { setRecordClock } from './record-clock'
import { useRecordSettings } from './record-settings'
import { cancelRecords, endTake, recordExpression, recordInSlot, recordNote, reconcileRecords, startArrangementTakes, stopTakes, useRecordStore } from './record-store'
import { useStatusStore } from './status-store'

const BASS = 'bass', LEAD = 'lead'
let clock = { beat: 0, lap: 0, run: 0, playing: false }

const setup = (loop?: Project['arrangementLoop']) => {
  const empty = createEmptyProject()
  let project: Project = { ...empty, tracks: [{ ...(empty.tracks[0] as InstrumentTrack), id: BASS, name: 'Bass' }], ...(loop && { arrangementLoop: loop }) }
  project = addTrack(project, { ...createTrack('Lead', project.sceneCount), id: LEAD })
  useProjectStore.getState().resetProject(project)
  clock = { beat: 0, lap: 0, run: 0, playing: false }
  setRecordClock((agoMs) => (clock.playing ? { beat: clock.beat - (agoMs / 1000) * 2, lap: clock.lap, run: clock.run } : undefined), () => 0)
}
const session = (beat: number, tracks: Record<string, Partial<LauncherStatus>> = {}, playing = true) => {
  clock = { ...clock, beat, playing }
  const status: EngineStatus = {
    playing, mode: 'session', beat, peak: 0, peaks: {}, readouts: {},
    tracks: Object.fromEntries(Object.entries(tracks).map(([id, l]) => [id, { playingClipId: null, startBeat: null, queued: null, ...l }])),
  }
  reconcileRecords(status)
  useStatusStore.getState().setStatus(status)
}
const arrangement = (beat: number, run = clock.run, lap = 0) => {
  clock = { beat, lap, run, playing: true }
  const status: EngineStatus = { playing: true, mode: 'arrangement', beat, run, lap, peak: 0, peaks: {}, readouts: {}, tracks: {} }
  reconcileRecords(status)
  useStatusStore.getState().setStatus(status)
}
/** A control as the adapter passes it; `at` (ms) is half a second a beat, as at 120 BPM. */
const express = (trackId: string, beat: number, control: ExpressionControl, value: number, extra: { lap?: number; run?: number; at?: number } = {}) =>
  recordExpression(trackId, { source: 'midi:keys', channel: 0, control, value, beat, at: extra.at ?? beat * 500, ...(extra.lap !== undefined && { lap: extra.lap }), ...(extra.run !== undefined && { run: extra.run }) })
const on = (trackId: string, beat: number) => recordNote(trackId, { kind: 'on', source: 'midi:keys', channel: 0, pitch: 60, velocity: 0.8, beat })
const off = (trackId: string, beat: number) => recordNote(trackId, { kind: 'off', source: 'midi:keys', channel: 0, pitch: 60, beat })
const clipIn = (trackId: string, scene: number) => {
  const track = useProjectStore.getState().project.tracks.find((t) => t.id === trackId)
  return track?.kind === 'instrument' ? (track.clips[scene] ?? null) : null
}
const laneOf = (lanes: readonly AutomationLane[] | undefined, control: 'pitchBend' | 'pressure' | 'cc', cc?: number) =>
  lanes?.find((lane) => lane.target.kind === 'expression' && lane.target.control === control && (cc === undefined || (lane.target.control === 'cc' && lane.target.cc === cc)))
const at = (lane: AutomationLane | undefined, beat: number) => Number((automationPosition(lane!, beat) ?? NaN).toFixed(3))

beforeEach(() => {
  setup()
  useRecordSettings.setState({ fixedBars: 0, countInBars: 0 })
})
afterEach(() => {
  cancelRecords()
  setRecordClock()
  useStatusStore.setState({ status: null })
  vi.useRealTimers()
})

describe('recording expression into a slot take', () => {
  it('makes a pitch bend and a mod wheel lane with the notes, in one undo step', () => {
    const before = serializeProject(useProjectStore.getState().project)
    useRecordStore.getState().arm(BASS, true)
    session(0)
    expect(recordInSlot(BASS, 0, vi.fn())).toBe(true)
    const clip = clipIn(BASS, 0)!
    session(0.1, { [BASS]: { playingClipId: clip.id, startBeat: 0 } })
    on(BASS, 0.5)
    // Up a whole step and back, and the mod wheel moved up over a beat.
    express(BASS, 1, 'pitchBend', 0.5); express(BASS, 1.5, 'pitchBend', 1); express(BASS, 2, 'pitchBend', 0)
    express(BASS, 2, { cc: 1 }, 0.2); express(BASS, 2.5, { cc: 1 }, 0.6); express(BASS, 3, { cc: 1 }, 0.9)
    // The bend's span ended: its lane is in the clip already.
    expect(laneOf(clipIn(BASS, 0)!.automation, 'pitchBend')).toBeDefined()
    off(BASS, 3.5)
    session(3.6, { [BASS]: { playingClipId: clip.id, startBeat: 0 } })
    endTake(BASS)
    session(4.1, { [BASS]: { playingClipId: clip.id, startBeat: 0 } })
    session(8, { [BASS]: { playingClipId: clip.id, startBeat: 0 } })
    expect(useRecordStore.getState().takes[BASS]).toBeUndefined()
    const recorded = clipIn(BASS, 0)!
    expect(recorded.notes).toHaveLength(1)
    const bend = laneOf(recorded.automation, 'pitchBend'), mod = laneOf(recorded.automation, 'cc', 1)
    expect([at(bend, 0.5), at(bend, 1), at(bend, 1.5), at(bend, 2), at(bend, 3)]).toEqual([0.5, 0.75, 1, 0.5, 0.5])
    expect([at(mod, 1), at(mod, 2), at(mod, 2.5), at(mod, 3)]).toEqual([0, 0.2, 0.6, 0.9])
    expect(recorded.automation?.every((lane) => lane.enabled)).toBe(true)
    useProjectStore.getState().undo()
    expect(serializeProject(useProjectStore.getState().project)).toBe(before)
  })

  it('a take of expression alone keeps its lanes, and an open bend holds to the end', () => {
    useRecordStore.getState().arm(BASS, true)
    session(0)
    recordInSlot(BASS, 0, vi.fn())
    const clip = clipIn(BASS, 0)!
    session(0.1, { [BASS]: { playingClipId: clip.id, startBeat: 0 } })
    express(BASS, 1, 'pressure', 0.5)
    session(2, { [BASS]: { playingClipId: clip.id, startBeat: 0 } })
    stopTakes(3)
    const pressure = laneOf(clipIn(BASS, 0)!.automation, 'pressure')
    expect([at(pressure, 0.5), at(pressure, 1), at(pressure, 2.9)]).toEqual([0, 0.5, 0.5])
    expect(clipIn(BASS, 0)!.lengthBeats).toBe(4)
  })

  it('writes an open span once a bar, so it shows as it grows', () => {
    useRecordStore.getState().arm(BASS, true)
    session(0)
    recordInSlot(BASS, 0, vi.fn())
    const clip = clipIn(BASS, 0)!
    const playing = { [BASS]: { playingClipId: clip.id, startBeat: 0 } }
    session(0.1, playing)
    express(BASS, 1, 'pressure', 0.3)
    session(4.2, playing)
    expect(at(laneOf(clipIn(BASS, 0)!.automation, 'pressure'), 4)).toBe(0.3)
    express(BASS, 5, 'pressure', 0.7)
    session(8.2, playing)
    expect(at(laneOf(clipIn(BASS, 0)!.automation, 'pressure'), 6)).toBe(0.7)
  })

  it('a lane full of points stops recording with a notice; the notes go on', () => {
    useRecordStore.getState().arm(BASS, true)
    session(0)
    recordInSlot(BASS, 0, vi.fn())
    const clip = clipIn(BASS, 0)!
    session(0.1, { [BASS]: { playingClipId: clip.id, startBeat: 0 } })
    // Each wiggle is a span of three points, far enough apart that none simplifies away: 700 of them pass 2048 points.
    for (let i = 0; i < 700; i++) { const beat = 0.2 + i * 0.3; express(BASS, beat, 'pitchBend', 0.9); express(BASS, beat + 0.1, 'pitchBend', -0.9); express(BASS, beat + 0.2, 'pitchBend', 0) }
    expect(useRecordStore.getState().feedback).toBe('Pitch bend on Bass: too many points, stopped recording it')
    const points = laneOf(clipIn(BASS, 0)!.automation, 'pitchBend')!.points.length
    expect(points).toBeLessThanOrEqual(2048)
    on(BASS, 212); off(BASS, 213)
    expect(clipIn(BASS, 0)!.notes).toHaveLength(1)
  })
  it('undo during a take ends it first, then takes its notes and lanes away together', () => {
    const before = serializeProject(useProjectStore.getState().project)
    useRecordStore.getState().arm(BASS, true)
    session(0)
    recordInSlot(BASS, 0, vi.fn())
    const clip = clipIn(BASS, 0)!
    session(0.1, { [BASS]: { playingClipId: clip.id, startBeat: 0 } })
    on(BASS, 0.5); express(BASS, 1, 'pitchBend', 0.4)
    session(1.5, { [BASS]: { playingClipId: clip.id, startBeat: 0 } })
    useProjectStore.getState().undo()
    expect(useRecordStore.getState().takes[BASS]).toBeUndefined()
    expect(serializeProject(useProjectStore.getState().project)).toBe(before)
    useProjectStore.getState().redo()
    expect(clipIn(BASS, 0)!.notes).toHaveLength(1)
    expect(laneOf(clipIn(BASS, 0)!.automation, 'pitchBend')).toBeDefined()
  })
})

describe('recording expression in an overdub', () => {
  it('each pass replaces only its own span, and keeps the lane around it', () => {
    const project = setClipAt(useProjectStore.getState().project, BASS, 0, { ...createClip('Loop', 8), id: 'loop' })
    useProjectStore.getState().resetProject(project)
    useRecordStore.getState().arm(BASS, true)
    const playing = { [BASS]: { playingClipId: 'loop', startBeat: 0 } }
    session(0.5, playing)
    useRecordStore.getState().setRec(true)
    // Pass 1: pressure over beats 1 to 5. Pass 2: a swell over beats 2 to 3 only.
    express(BASS, 1, 'pressure', 0.4); express(BASS, 5, 'pressure', 0)
    session(8.5, playing)
    express(BASS, 10, 'pressure', 0.9); express(BASS, 11, 'pressure', 0)
    session(11.5, playing)
    useRecordStore.getState().setRec(false)
    const lane = laneOf(clipIn(BASS, 0)!.automation, 'pressure')
    expect([at(lane, 1.5), at(lane, 2.5), at(lane, 4), at(lane, 6)]).toEqual([0.4, 0.9, 0.4, 0])
  })
})

describe('recording expression into the arrangement', () => {
  it('a region appears with its first span, and its lanes hold what was played', () => {
    useRecordStore.getState().setRec(true)
    useRecordStore.getState().arm(BASS, true)
    startArrangementTakes(4)
    arrangement(4.05, 1)
    express(BASS, 5, 'pitchBend', 1, { run: 1, lap: 0 }); express(BASS, 6, 'pitchBend', 0, { run: 1, lap: 0 })
    const [region] = useProjectStore.getState().project.arrangement ?? []
    expect(region).toMatchObject({ trackId: BASS, startBeat: 4 })
    expect('notes' in region!.content && region!.content.notes).toEqual([])
    const lane = laneOf(region!.content.automation, 'pitchBend')
    expect([at(lane, 0.5), at(lane, 1), at(lane, 2), at(lane, 3)]).toEqual([0.5, 1, 0.5, 0.5])
  })

  it('across the loop brace, a later pass replaces an earlier one where they overlap', () => {
    setup({ enabled: true, from: 0, to: 8 })
    useRecordStore.getState().setRec(true)
    useRecordStore.getState().arm(BASS, true)
    startArrangementTakes(0)
    arrangement(0.05, 1, 0)
    express(BASS, 1, 'pressure', 0.3, { run: 1, lap: 0 }); express(BASS, 4, 'pressure', 0, { run: 1, lap: 0 })
    arrangement(1, 1, 1)
    express(BASS, 2, 'pressure', 0.8, { run: 1, lap: 1 }); express(BASS, 3, 'pressure', 0, { run: 1, lap: 1 })
    arrangement(3.5, 1, 1)
    useRecordStore.getState().setRec(false)
    const regions = useProjectStore.getState().project.arrangement ?? []
    expect(regions).toHaveLength(1)
    expect(regions[0]).toMatchObject({ startBeat: 0 })
    const lane = laneOf(regions[0]!.content.automation, 'pressure')
    expect([at(lane, 1.5), at(lane, 2.5), at(lane, 3.5), at(lane, 6)]).toEqual([0.3, 0.8, 0.3, 0])
  })
})
