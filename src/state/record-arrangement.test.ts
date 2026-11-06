import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type EngineStatus, type InstrumentTrack, type Project, addTrack, createEmptyProject, createTrack } from '@core'
import { useProjectStore } from './project-store'
import { setRecordClock } from './record-clock'
import { useRecordSettings } from './record-settings'
import { cancelRecords, endTakesNow, recordInSlot, recordNote, reconcileRecords, startArrangementTakes, stopTakes, useRecordStore } from './record-store'
import { useSelectionStore } from './selection-store'
import { useStatusStore } from './status-store'

const BASS = 'bass', LEAD = 'lead'
/** The engine as the clock and the status see it: the beat, the run and the loop pass. */
let clock = { beat: 0, lap: 0, run: 0, playing: false }

const setup = (loop?: Project['arrangementLoop']) => {
  const empty = createEmptyProject()
  let project: Project = { ...empty, tracks: [{ ...(empty.tracks[0] as InstrumentTrack), id: BASS, name: 'Bass' }], ...(loop && { arrangementLoop: loop }) }
  project = addTrack(project, { ...createTrack('Lead', project.sceneCount), id: LEAD })
  useProjectStore.getState().resetProject(project)
  clock = { beat: 0, lap: 0, run: 0, playing: false }
  // 120 BPM: two beats a second. The clock reads the position at the time asked, in the current run and pass.
  setRecordClock((agoMs) => (clock.playing ? { beat: clock.beat - (agoMs / 1000) * 2, lap: clock.lap, run: clock.run } : undefined), () => 0)
}

/** A status from the engine: the arrangement playing at `beat` in `run`, pass `lap`, unless said otherwise. */
const tick = (beat: number, run = clock.run, lap = 0, extra: Partial<EngineStatus> = {}) => {
  const playing = extra.playing ?? true
  clock = { beat, lap, run, playing }
  const status: EngineStatus = { playing, mode: 'arrangement', beat, run, lap, peak: 0, peaks: {}, readouts: {}, tracks: {}, ...extra }
  reconcileRecords(status)
  useStatusStore.getState().setStatus(status)
}
/** ■ at `beat`: the clock is there when the recorder asks. */
const stopAt = (beat: number) => { clock = { ...clock, beat }; stopTakes(beat) }
const stopped = (run = clock.run) => tick(0, run, 0, { playing: false })

const note = (trackId: string, beat: number, kind: 'on' | 'off', pitch = 60, lap = clock.lap, run = clock.run) =>
  recordNote(trackId, kind === 'on' ? { kind, source: 'midi:keys', channel: 0, pitch, velocity: 0.8, beat, lap, run } : { kind, source: 'midi:keys', channel: 0, pitch, beat, lap, run })
/** A note from `on` to `off` (beats in the same pass unless `offLap` says otherwise). */
const play = (trackId: string, on: number, off: number, pitch = 60, lap = clock.lap, offLap = lap) => {
  note(trackId, on, 'on', pitch, lap)
  note(trackId, off, 'off', pitch, offLap)
}

const regions = (trackId?: string) =>
  (useProjectStore.getState().project.arrangement ?? []).filter((r) => !trackId || r.trackId === trackId)
/** Each region as [start, length, [[pitch, start, duration], …]], rounded so tables read plainly. */
const shape = (trackId?: string) => regions(trackId).map((r) => [r.startBeat, r.content.lengthBeats, 'notes' in r.content ? r.content.notes.map((n) => [n.pitch, +n.start.toFixed(6), +n.duration.toFixed(6)]) : []])
const rec = (on: boolean) => useRecordStore.getState().setRec(on)
const arm = (...trackIds: string[]) => { for (const id of trackIds) useRecordStore.getState().arm(id, true) }
/** ▶ on the arrangement from `from`, the engine starting run `run` there. */
const playFrom = (from: number, run = clock.run + 1) => {
  startArrangementTakes(from)
  tick(from, run)
}

beforeEach(() => {
  setup()
  useRecordSettings.setState({ fixedBars: 0, countInBars: 0 })
  useSelectionStore.getState().reset()
})
afterEach(() => {
  cancelRecords()
  setRecordClock()
  useStatusStore.setState({ status: null })
  vi.useRealTimers()
})

describe('recording into the arrangement', () => {
  it('▶ from the middle of a bar: one region per track that got notes, from that bar to the bar it stopped in', () => {
    rec(true)
    arm(BASS, LEAD)
    stopped()
    startArrangementTakes(5)
    expect(useRecordStore.getState().takes[BASS]).toMatchObject({ kind: 'region', state: 'queued' })
    tick(5.05, 1)
    expect(useRecordStore.getState().takes[BASS]?.state).toBe('recording')
    // A note a little early counts as on the first beat.
    play(BASS, 4.9, 6)
    play(BASS, 7, 7.5, 62)
    tick(9)
    stopAt(9)
    expect(shape(BASS)).toEqual([[4, 8, [[60, 1, 1], [62, 3, 0.5]]]])
    expect(shape(LEAD)).toEqual([])
    expect(useRecordStore.getState().feedback).toBe('Recorded 2 bars on Bass')
  })

  it('a take is one undo step, and redo brings it back', () => {
    rec(true)
    arm(BASS, LEAD)
    playFrom(0)
    play(BASS, 1, 2)
    play(LEAD, 1.5, 2, 64)
    tick(5)
    play(BASS, 5, 6)
    stopAt(6.5)
    expect(regions()).toHaveLength(2)
    useProjectStore.getState().undo()
    expect(regions()).toHaveLength(0)
    useProjectStore.getState().redo()
    expect(regions()).toHaveLength(2)
  })

  it('the region appears with the first note and grows a bar at a time', () => {
    rec(true)
    arm(BASS)
    playFrom(0)
    tick(2)
    expect(regions()).toHaveLength(0)
    expect(useRecordStore.getState().takes[BASS]?.outlineFrom).toBe(0)
    play(BASS, 2, 3)
    expect(shape(BASS)).toEqual([[0, 4, [[60, 2, 1]]]])
    expect(useRecordStore.getState().takes[BASS]?.regions).toEqual([regions()[0]!.id])
    tick(4.1)
    expect(shape(BASS)[0]![1]).toBe(8)
    tick(11)
    expect(shape(BASS)[0]![1]).toBe(12)
  })

  it('punch in at beat 6 and out at 6.5: one region from bar 2 to its end, nothing from before the press', () => {
    arm(BASS)
    playFrom(0)
    tick(6)
    play(BASS, 5.9, 6.05)
    rec(true)
    play(BASS, 6.1, 6.3, 62)
    clock = { ...clock, beat: 6.5 }
    rec(false)
    expect(shape(BASS)).toEqual([[4, 4, [[62, 2.1, 0.2]]]])
  })

  it('ends held notes at the punch-out', () => {
    arm(BASS)
    rec(true)
    playFrom(0)
    note(BASS, 1, 'on')
    clock = { ...clock, beat: 3 }
    rec(false)
    expect(shape(BASS)).toEqual([[0, 4, [[60, 1, 2]]]])
  })

  it('a track armed while recording joins from the arm, in the same undo step', () => {
    rec(true)
    arm(BASS)
    playFrom(0)
    play(BASS, 1, 2)
    tick(9)
    arm(LEAD)
    play(LEAD, 8.5, 9.5) // before the arm: dropped
    play(LEAD, 9.5, 10)
    stopAt(10)
    expect(shape(LEAD)).toEqual([[8, 4, [[60, 1.5, 0.5]]]])
    useProjectStore.getState().undo()
    expect(regions()).toHaveLength(0)
  })
})

describe('the loop brace', () => {
  it('merges passes into one region spanning the brace, with a lead-in from before it', () => {
    setup({ from: 8, to: 16, enabled: true })
    rec(true)
    arm(BASS)
    playFrom(4)
    play(BASS, 5, 5.5)
    play(BASS, 9, 9.5, 62)
    // A note held across the jump is cut at the brace's end.
    play(BASS, 15, 9, 64, 0, 1)
    tick(10, 1, 1)
    play(BASS, 10, 10.5, 65)
    tick(12, 1, 2)
    play(BASS, 12, 12.5, 67)
    stopAt(13)
    expect(shape(BASS)).toEqual([[4, 12, [[60, 1, 0.5], [62, 5, 0.5], [65, 6, 0.5], [67, 8, 0.5], [64, 11, 1]]]])
  })

  it('a punch-in inside the brace: the region is the bars recorded until the jump, then the whole brace', () => {
    setup({ from: 2, to: 12, enabled: true })
    arm(BASS)
    playFrom(0)
    tick(6)
    rec(true)
    play(BASS, 6.5, 7)
    expect(shape(BASS)).toEqual([[4, 4, [[60, 2.5, 0.5]]]])
    tick(3, 1, 1)
    expect(shape(BASS)).toEqual([[2, 10, [[60, 4.5, 0.5]]]])
    play(BASS, 3, 3.5, 62, 1)
    clock = { ...clock, beat: 4 }
    rec(false)
    expect(shape(BASS)).toEqual([[2, 10, [[62, 1, 0.5], [60, 4.5, 0.5]]]])
  })

  it('a take that starts after the brace never loops', () => {
    setup({ from: 0, to: 4, enabled: true })
    rec(true)
    arm(BASS)
    playFrom(8)
    play(BASS, 9, 10)
    stopAt(10)
    expect(shape(BASS)).toEqual([[8, 4, [[60, 1, 1]]]])
  })

  it('a brace changed during a take ends it and opens another from there', () => {
    setup({ from: 0, to: 16, enabled: true })
    rec(true)
    arm(BASS)
    playFrom(0)
    play(BASS, 1, 2)
    tick(5)
    useProjectStore.setState({ project: { ...useProjectStore.getState().project, arrangementLoop: { from: 0, to: 8, enabled: true } } })
    tick(5.1)
    play(BASS, 6, 7, 62)
    stopAt(7)
    expect(shape(BASS)).toEqual([[0, 8, [[60, 1, 1]]], [4, 4, [[62, 2, 1]]]])
  })
})

describe('what ends a take', () => {
  it('a seek ends it there and records again from the new position, in the new run', () => {
    rec(true)
    arm(BASS)
    playFrom(0, 1)
    play(BASS, 1, 2)
    tick(9)
    startArrangementTakes(20)
    // A note-on stamped in the old run, read after the seek, can't land in the new take.
    note(BASS, 9.1, 'on', 61, 0, 1)
    note(BASS, 9.2, 'off', 61, 0, 1)
    tick(20.05, 2)
    play(BASS, 21, 22, 62)
    stopAt(22)
    expect(shape(BASS)).toEqual([[0, 12, [[60, 1, 1]]], [20, 4, [[62, 1, 1]]]])
    // Two undo steps: the seek started a new one.
    useProjectStore.getState().undo()
    expect(regions()).toHaveLength(1)
  })

  it('the Session taking over ends it at the switch', () => {
    rec(true)
    arm(BASS)
    playFrom(0)
    play(BASS, 1, 2)
    tick(5, clock.run, 0, { mode: 'session' })
    expect(useRecordStore.getState().takes[BASS]?.kind).not.toBe('region')
    expect(shape(BASS)).toEqual([[0, 8, [[60, 1, 1]]]])
  })

  it('the transport stopping ends it where it stopped', () => {
    rec(true)
    arm(BASS)
    playFrom(0)
    note(BASS, 1, 'on')
    tick(6.5)
    stopped()
    expect(useRecordStore.getState().takes[BASS]).toBeUndefined()
    expect(shape(BASS)).toEqual([[0, 8, [[60, 1, 5.5]]]])
  })

  it('removing the region ends the take, and no new one opens on its own', () => {
    rec(true)
    arm(BASS)
    playFrom(0)
    play(BASS, 1, 2)
    const project = useProjectStore.getState().project
    useProjectStore.setState({ project: { ...project, arrangement: [] } })
    expect(useRecordStore.getState().takes[BASS]).toBeUndefined()
    expect(useRecordStore.getState().feedback).toBe('The take ended: its region was removed')
    tick(6)
    expect(useRecordStore.getState().takes[BASS]).toBeUndefined()
  })

  it('a region changed by something else ends its take and is left as it is', () => {
    rec(true)
    arm(BASS)
    playFrom(0)
    play(BASS, 1, 2)
    const project = useProjectStore.getState().project
    const moved = { ...project.arrangement![0]!, startBeat: 32 }
    useProjectStore.setState({ project: { ...project, arrangement: [moved] } })
    play(BASS, 2, 3)
    expect(shape(BASS)).toEqual([[32, 4, [[60, 1, 1]]]])
    expect(useRecordStore.getState().feedback).toBe('The take ended: its region was changed')
  })

  it('undo during a take ends it first, and recording goes on in a new take', () => {
    rec(true)
    arm(BASS)
    playFrom(0)
    play(BASS, 1, 2)
    tick(3)
    endTakesNow()
    useProjectStore.getState().undo()
    expect(regions()).toHaveLength(0)
    tick(5)
    expect(useRecordStore.getState().takes[BASS]?.kind).toBe('region')
  })
})

describe('past 64 bars', () => {
  it('goes on in a new region, a note held across the split in both', () => {
    rec(true)
    arm(BASS)
    playFrom(0)
    play(BASS, 2, 3)
    for (let beat = 4; beat <= 280; beat += 4) tick(beat + 0.1)
    play(BASS, 254, 258, 62)
    play(BASS, 270, 271, 64)
    stopAt(280)
    expect(shape(BASS)).toEqual([[0, 256, [[60, 2, 1], [62, 254, 2]]], [256, 28, [[62, 0, 2], [64, 14, 1]]]])
  })
})

describe('count-in', () => {
  it('a note in the count-in within a sixteenth of the start lands on it', () => {
    rec(true)
    arm(BASS)
    stopped(0)
    startArrangementTakes(8)
    // The engine counts in (run 1 begins), then starts at 8 in the same run.
    tick(0, 1, 0, { playing: false, countIn: { barsLeft: 1, beat: -1 } })
    note(BASS, -0.1, 'on', 60, 0, 1)
    tick(8.05, 1)
    note(BASS, 9, 'off', 60, 0, 1)
    stopAt(9.5)
    expect(shape(BASS)).toEqual([[8, 4, [[60, 0, 1]]]])
  })

  it('■ during the count-in leaves nothing', () => {
    rec(true)
    arm(BASS)
    stopped(0)
    startArrangementTakes(8)
    tick(0, 1, 0, { playing: false, countIn: { barsLeft: 1, beat: -3 } })
    stopTakes()
    expect(useRecordStore.getState().takes[BASS]).toBeUndefined()
    expect(regions()).toHaveLength(0)
    expect(useRecordStore.getState().feedback).toBe('Count-in stopped: nothing recorded')
  })
})

describe('the end of a pass', () => {
  it('selects the selected track\'s new region, so the selected track stays', () => {
    useSelectionStore.getState().selectTrack(LEAD)
    rec(true)
    arm(BASS, LEAD)
    playFrom(0)
    play(BASS, 1, 2)
    play(LEAD, 1, 2, 64)
    stopAt(3)
    const lead = regions(LEAD)[0]!
    expect(useSelectionStore.getState()).toMatchObject({ regionId: lead.id, trackId: LEAD })
    expect(useRecordStore.getState().feedback).toBe('Recorded 1 bar on Bass, Lead')
  })

  it('says so when nothing was played', () => {
    rec(true)
    arm(BASS)
    playFrom(0)
    stopAt(3)
    expect(regions()).toHaveLength(0)
    expect(useRecordStore.getState().feedback).toBe('Nothing played: no region made')
  })
})

describe('Session takes that run at the same time', () => {
  it('are one undo step together', () => {
    arm(BASS, LEAD)
    tick(1, 0, 0, { mode: 'session' })
    const launch = vi.fn()
    recordInSlot(BASS, 0, launch)
    recordInSlot(LEAD, 0, launch)
    const clipOf = (id: string) => (useProjectStore.getState().project.tracks.find((t) => t.id === id) as InstrumentTrack).clips[0]!
    const bass = clipOf(BASS).id, lead = clipOf(LEAD).id
    const playing = { [BASS]: { playingClipId: bass, startBeat: 4, queued: null }, [LEAD]: { playingClipId: lead, startBeat: 4, queued: null } }
    tick(4.1, 0, 0, { mode: 'session', tracks: playing })
    // Interleaved notes on the two tracks used to split each other into steps.
    recordNote(BASS, { kind: 'on', source: 'midi:keys', channel: 0, pitch: 60, velocity: 0.8, beat: 5 })
    recordNote(LEAD, { kind: 'on', source: 'midi:keys', channel: 0, pitch: 64, velocity: 0.8, beat: 5 })
    recordNote(BASS, { kind: 'off', source: 'midi:keys', channel: 0, pitch: 60, beat: 6 })
    recordNote(LEAD, { kind: 'off', source: 'midi:keys', channel: 0, pitch: 64, beat: 6 })
    stopAt(7)
    expect(clipOf(BASS).notes).toHaveLength(1)
    useProjectStore.getState().undo()
    expect(clipOf(BASS)).toBeNull()
    expect(clipOf(LEAD)).toBeNull()
  })
})
