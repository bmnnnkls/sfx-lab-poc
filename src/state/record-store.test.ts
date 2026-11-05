import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Clip, type EngineStatus, type InstrumentTrack, type LauncherStatus, type Project, addTrack, createAudioTrack, createClip, createEmptyProject, createTrack, serializeProject, setClipAt } from '@core'
import { useProjectStore } from './project-store'
import { setRecordClock } from './record-clock'
import { useRecordSettings } from './record-settings'
import { cancelRecords, countInBars, endTake, recordInSlot, recordNote, recordPedal, reconcileRecords, stopTakes, useRecordStore } from './record-store'
import { useStatusStore } from './status-store'

const BASS = 'bass', LEAD = 'lead'
let clock = { beat: 0, playing: false }

const setup = () => {
  const empty = createEmptyProject()
  let project: Project = { ...empty, tracks: [{ ...(empty.tracks[0] as InstrumentTrack), id: BASS, name: 'Bass' }] }
  project = addTrack(project, { ...createTrack('Lead', project.sceneCount), id: LEAD })
  project = addTrack(project, { ...createAudioTrack('Loop', project.sceneCount), id: 'audio' })
  useProjectStore.getState().resetProject(project)
  clock = { beat: 0, playing: false }
  // A clock at 120 BPM: two beats a second.
  setRecordClock((agoMs) => (clock.playing ? clock.beat - (agoMs / 1000) * 2 : undefined), () => 0)
  return project
}

/** Reports a status at `beat` with these launchers, as the engine does ~30 times a second. */
const tick = (beat: number, tracks: Record<string, Partial<LauncherStatus>> = {}, playing = true, extra: Partial<EngineStatus> = {}) => {
  clock = { beat, playing }
  const status: EngineStatus = {
    playing, mode: 'session', beat, peak: 0, peaks: {}, readouts: {}, ...extra,
    tracks: Object.fromEntries(Object.entries(tracks).map(([id, l]) => [id, { playingClipId: null, startBeat: null, queued: null, ...l }])),
  }
  reconcileRecords(status)
  useStatusStore.getState().setStatus(status)
}
const on = (trackId: string, beat: number | undefined, pitch = 60, velocity = 0.8) => recordNote(trackId, { kind: 'on', source: 'midi:keys', channel: 0, pitch, velocity, beat })
const off = (trackId: string, beat: number | undefined, pitch = 60) => recordNote(trackId, { kind: 'off', source: 'midi:keys', channel: 0, pitch, beat })
const clipIn = (trackId: string, scene: number): Clip | null => {
  const track = useProjectStore.getState().project.tracks.find((t) => t.id === trackId)
  return track?.kind === 'instrument' ? (track.clips[scene] ?? null) : null
}
const notes = (trackId: string, scene: number) => clipIn(trackId, scene)?.notes.map((n) => [n.pitch, n.start, n.duration]) ?? []

/** Records from the slot while the transport plays at `at`, and starts the take at the bar after. */
const startTake = (trackId: string, scene: number, at: number) => {
  tick(at)
  const launch = vi.fn()
  expect(recordInSlot(trackId, scene, launch)).toBe(true)
  const clip = clipIn(trackId, scene)!
  expect(launch).toHaveBeenCalledWith(trackId, clip.id)
  const start = Math.ceil(at / 4) * 4
  return { clip, start, playing: { playingClipId: clip.id, startBeat: start } }
}

beforeEach(() => {
  setup()
  useRecordSettings.setState({ fixedBars: 0, countInBars: 0 })
})
afterEach(() => {
  cancelRecords()
  setRecordClock()
  useStatusStore.setState({ status: null })
})

describe('arming', () => {
  it('arms instrument tracks only, and is not an edit', () => {
    const history = useProjectStore.getState().history
    useRecordStore.getState().arm(BASS, true)
    useRecordStore.getState().arm('audio', true)
    useRecordStore.getState().arm(LEAD, true)
    useRecordStore.getState().arm(LEAD, true)
    expect(useRecordStore.getState().armed).toEqual([BASS, LEAD])
    useRecordStore.getState().arm(BASS, false)
    expect(useRecordStore.getState().armed).toEqual([LEAD])
    expect(useProjectStore.getState().history).toBe(history)
  })

  it('drops a removed track, and everything on a new document', () => {
    useRecordStore.getState().arm(BASS, true)
    useRecordStore.getState().arm(LEAD, true)
    useProjectStore.getState().removeTrack(LEAD)
    expect(useRecordStore.getState().armed).toEqual([BASS])
    useProjectStore.getState().resetProject(createEmptyProject())
    expect(useRecordStore.getState().armed).toEqual([])
  })

  it('needs the track armed to record into a slot', () => {
    expect(recordInSlot(BASS, 0, vi.fn())).toBe(false)
    expect(useRecordStore.getState().feedback).toBe('Arm a track to record into it')
    expect(clipIn(BASS, 0)).toBeNull()
  })
})

describe('a take', () => {
  beforeEach(() => useRecordStore.getState().arm(BASS, true))

  it('makes a clip in the slot, launches it, and records from its launch boundary', () => {
    const { clip, start, playing } = startTake(BASS, 1, 2.3)
    expect(clip).toMatchObject({ name: 'Clip 2', lengthBeats: 256, notes: [] })
    expect(useRecordStore.getState().takes[BASS]).toMatchObject({ clipId: clip.id, scene: 1, state: 'queued' })
    expect(useRecordStore.getState().feedback).toBe('Recording Bass')
    // Played early, within a sixteenth: counts as on the first beat. Released after the start.
    on(BASS, start - 0.1)
    tick(2.6, { [BASS]: { queued: clip.id } })
    off(BASS, start + 0.5)
    expect(notes(BASS, 1)).toEqual([])
    tick(start + 0.6, { [BASS]: playing })
    expect(useRecordStore.getState().takes[BASS]?.state).toBe('recording')
    expect(notes(BASS, 1)).toEqual([[60, 0, 0.5]])
    // Notes are written as they end.
    on(BASS, start + 1, 64); off(BASS, start + 1.5, 64)
    expect(notes(BASS, 1)).toEqual([[60, 0, 0.5], [64, 1, 0.5]])
  })

  it('drops notes played too early, and events without a beat', () => {
    const { start, playing } = startTake(BASS, 0, 1)
    on(BASS, start - 1, 50); off(BASS, start + 0.5, 50)
    on(BASS, undefined, 52); off(BASS, undefined, 52)
    tick(start + 1, { [BASS]: playing })
    expect(notes(BASS, 0)).toEqual([])
  })

  it('is one undo step however long it takes, with the clip made in it', () => {
    const before = serializeProject(useProjectStore.getState().project)
    const past = useProjectStore.getState().history.past.length
    vi.useFakeTimers()
    try {
      const { start, playing } = startTake(BASS, 0, 1)
      tick(start + 0.1, { [BASS]: playing })
      for (let i = 0; i < 6; i++) { vi.advanceTimersByTime(3000); on(BASS, start + i, 60 + i); off(BASS, start + i + 0.5, 60 + i) }
      endTake(BASS)
      tick(start + 8, { [BASS]: playing })
    } finally { vi.useRealTimers() }
    expect(useProjectStore.getState().history.past.length).toBe(past + 1)
    const after = serializeProject(useProjectStore.getState().project)
    useProjectStore.getState().undo()
    expect(serializeProject(useProjectStore.getState().project)).toBe(before)
    useProjectStore.getState().redo()
    expect(serializeProject(useProjectStore.getState().project)).toBe(after)
  })

  it('ends at the next bar after the press, with the length set at the press', () => {
    const { start, playing } = startTake(BASS, 0, 1)
    tick(start + 0.1, { [BASS]: playing })
    on(BASS, start + 6)
    tick(start + 5.2, { [BASS]: playing })
    endTake(BASS)
    // The press at bar 2, beat 2: the take ends at bar 3, and the clip already loops there.
    expect(clipIn(BASS, 0)!.lengthBeats).toBe(8)
    expect(useRecordStore.getState().takes[BASS]?.state).toBe('ending')
    tick(start + 7.9, { [BASS]: playing })
    expect(notes(BASS, 0)).toEqual([])
    tick(start + 8.05, { [BASS]: playing })
    // The note held at the end ends there.
    expect(notes(BASS, 0)).toEqual([[60, 6, 2]])
    expect(useRecordStore.getState().takes[BASS]).toBeUndefined()
    expect(useRecordStore.getState().feedback).toBe('Recorded 2 bars into Clip 1')
  })

  it('ends a bar later when the press is within a quarter beat of the next bar', () => {
    const { start, playing } = startTake(BASS, 0, 1)
    tick(start + 3.8, { [BASS]: playing })
    endTake(BASS)
    expect(clipIn(BASS, 0)!.lengthBeats).toBe(8)
    tick(start + 3.7, { [BASS]: playing })
    endTake(BASS)
    expect(clipIn(BASS, 0)!.lengthBeats).toBe(8)
  })

  it('is at least a bar long', () => {
    const { start, playing } = startTake(BASS, 0, 1)
    tick(start + 0.1, { [BASS]: playing })
    clock.beat = start + 0.1
    endTake(BASS)
    expect(clipIn(BASS, 0)!.lengthBeats).toBe(4)
  })

  it('ends by itself at the fixed length', () => {
    useRecordSettings.setState({ fixedBars: 2 })
    const { clip, start, playing } = startTake(BASS, 0, 1)
    expect(clip.lengthBeats).toBe(8)
    tick(start + 0.1, { [BASS]: playing })
    on(BASS, start + 7)
    tick(start + 8.01, { [BASS]: playing })
    expect(useRecordStore.getState().takes[BASS]).toBeUndefined()
    expect(notes(BASS, 0)).toEqual([[60, 7, 1]])
    expect(useRecordStore.getState().feedback).toBe('Recorded 2 bars into Clip 1')
  })

  it('ends at 64 bars, with a notice', () => {
    const { start, playing } = startTake(BASS, 0, 1)
    tick(start + 0.1, { [BASS]: playing })
    tick(start + 256, { [BASS]: playing })
    expect(useRecordStore.getState().takes[BASS]).toBeUndefined()
    expect(clipIn(BASS, 0)!.lengthBeats).toBe(256)
    expect(useRecordStore.getState().feedback).toBe('64 bars reached: the take ended')
  })

  it('ends at once when the transport stops, at the bar after, with held notes closed at the stop', () => {
    const { start, playing } = startTake(BASS, 0, 1)
    tick(start + 0.1, { [BASS]: playing })
    on(BASS, start + 5)
    stopTakes(start + 5.5)
    expect(useRecordStore.getState().takes[BASS]).toBeUndefined()
    expect(clipIn(BASS, 0)!.lengthBeats).toBe(8)
    expect(notes(BASS, 0)).toEqual([[60, 5, 0.5]])
  })

  it('ends when the status reports the transport stopped', () => {
    const { start, playing } = startTake(BASS, 0, 1)
    tick(start + 4.5, { [BASS]: playing })
    tick(0, {}, false)
    expect(useRecordStore.getState().takes[BASS]).toBeUndefined()
    expect(clipIn(BASS, 0)!.lengthBeats).toBe(8)
  })

  it('ends where the track stopped', () => {
    const { start, playing } = startTake(BASS, 0, 1)
    tick(start + 2, { [BASS]: playing })
    tick(start + 4.1, { [BASS]: { stopBeat: start + 4 } })
    expect(useRecordStore.getState().takes[BASS]).toBeUndefined()
    expect(clipIn(BASS, 0)!.lengthBeats).toBe(4)
  })

  it('folds the sustain pedal into note lengths', () => {
    const { start, playing } = startTake(BASS, 0, 1)
    tick(start + 0.1, { [BASS]: playing })
    recordPedal('midi:keys', 0, true, start + 0.5)
    on(BASS, start + 1); off(BASS, start + 1.5)
    expect(notes(BASS, 0)).toEqual([])
    recordPedal('midi:keys', 0, false, start + 3)
    expect(notes(BASS, 0)).toEqual([[60, 1, 2]])
  })

  it('ends during undo first, then undoes the whole take', () => {
    const before = serializeProject(useProjectStore.getState().project)
    const { start, playing } = startTake(BASS, 0, 1)
    tick(start + 0.1, { [BASS]: playing })
    on(BASS, start + 1)
    clock.beat = start + 2
    useProjectStore.getState().undo()
    expect(useRecordStore.getState().takes[BASS]).toBeUndefined()
    expect(serializeProject(useProjectStore.getState().project)).toBe(before)
    useProjectStore.getState().redo()
    expect(clipIn(BASS, 0)).toMatchObject({ lengthBeats: 4 })
    expect(notes(BASS, 0)).toEqual([[60, 1, 1]])
  })

  it('drops a take unwritten on a new document', () => {
    const { start, playing } = startTake(BASS, 0, 1)
    tick(start + 0.1, { [BASS]: playing })
    const fresh = setup()
    on(BASS, start + 1); off(BASS, start + 2)
    expect(useRecordStore.getState().takes).toEqual({})
    expect(useProjectStore.getState().project).toBe(useProjectStore.getState().history.present)
    expect(serializeProject(useProjectStore.getState().project)).toBe(serializeProject(fresh))
  })

  it('records layered tracks into their own clips, and names them all', () => {
    useRecordStore.getState().arm(LEAD, true)
    const bass = startTake(BASS, 0, 1)
    const lead = startTake(LEAD, 2, 1.5)
    expect(useRecordStore.getState().feedback).toBe('Recording Bass, Lead')
    tick(4.1, { [BASS]: bass.playing, [LEAD]: lead.playing })
    on(BASS, 5); on(LEAD, 5); off(BASS, 6); off(LEAD, 6)
    expect(notes(BASS, 0)).toEqual([[60, 1, 1]])
    expect(notes(LEAD, 2)).toEqual([[60, 1, 1]])
  })

  it('gives up a take whose clip never launches', () => {
    vi.useFakeTimers()
    try {
      startTake(BASS, 0, 1)
      tick(1.2)
      expect(useRecordStore.getState().takes[BASS]).toBeDefined()
      vi.advanceTimersByTime(3000)
      tick(1.3)
      expect(useRecordStore.getState().takes[BASS]).toBeUndefined()
    } finally { vi.useRealTimers() }
  })

  it('starts from a stopped transport at beat 0, and keeps no notes from before', () => {
    clock = { beat: 0, playing: false }
    const launch = vi.fn()
    recordInSlot(BASS, 0, launch)
    const clip = clipIn(BASS, 0)!
    on(BASS, undefined); off(BASS, undefined)
    tick(0.05, { [BASS]: { playingClipId: clip.id, startBeat: 0 } })
    on(BASS, 1); off(BASS, 2)
    expect(notes(BASS, 0)).toEqual([[60, 1, 1]])
  })
})

describe('overdub', () => {
  /** An 8-beat clip in Bass's first slot, Bass armed. */
  const loop = () => {
    const project = setClipAt(useProjectStore.getState().project, BASS, 0, { ...createClip('Loop', 8), id: 'loop' })
    useProjectStore.getState().resetProject(project)
    useRecordStore.getState().arm(BASS, true)
    return { playingClipId: 'loop', startBeat: 4 }
  }
  const rec = (on: boolean) => useRecordStore.getState().setRec(on)

  it('adds what is played over a playing clip, pass after pass, placed by its position in the pass', () => {
    const playing = loop()
    tick(5, { [BASS]: playing })
    rec(true)
    expect(useRecordStore.getState().takes[BASS]).toMatchObject({ kind: 'overdub', clipId: 'loop', state: 'recording' })
    expect(useRecordStore.getState().feedback).toBe('Overdubbing Bass')
    on(BASS, 6); off(BASS, 6.5)
    tick(13, { [BASS]: playing })
    on(BASS, 13.5, 64); off(BASS, 14, 64)
    // Pass 1 at beat 2, pass 2 at beat 1.5 of the clip.
    expect(notes(BASS, 0)).toEqual([[60, 2, 0.5], [64, 1.5, 0.5]])
    expect(clipIn(BASS, 0)!.lengthBeats).toBe(8)
  })

  it('is one undo step from ● Rec on to off, and an empty overdub is none', () => {
    const playing = loop()
    const before = serializeProject(useProjectStore.getState().project)
    const past = useProjectStore.getState().history.past.length
    tick(5, { [BASS]: playing })
    rec(true)
    rec(false)
    expect(useProjectStore.getState().history.past.length).toBe(past)
    rec(true)
    on(BASS, 6); off(BASS, 6.5); on(BASS, 14); off(BASS, 15)
    rec(false)
    expect(useRecordStore.getState().takes[BASS]).toBeUndefined()
    expect(useProjectStore.getState().history.past.length).toBe(past + 1)
    useProjectStore.getState().undo()
    expect(serializeProject(useProjectStore.getState().project)).toBe(before)
  })

  it('cuts a note held across the clip end, and closes held notes when ● Rec goes off', () => {
    const playing = loop()
    tick(5, { [BASS]: playing })
    rec(true)
    on(BASS, 11); off(BASS, 13)
    expect(notes(BASS, 0)).toEqual([[60, 7, 1]])
    on(BASS, 14, 62)
    clock.beat = 15
    rec(false)
    expect(notes(BASS, 0)).toEqual([[60, 7, 1], [62, 2, 1]])
  })

  it('punches in at the press: nothing from before it, not even an early note', () => {
    const playing = loop()
    tick(6, { [BASS]: playing })
    rec(true)
    on(BASS, 5.9); off(BASS, 6.5)
    on(BASS, 7, 62); off(BASS, 7.5, 62)
    expect(notes(BASS, 0)).toEqual([[62, 3, 0.5]])
  })

  it('records a clip launched with ● Rec on from its start, early notes on its first beat, through a count-in', () => {
    loop()
    rec(true)
    useRecordSettings.setState({ countInBars: 1 })
    expect(countInBars()).toBe(1)
    // The count-in: the clip is queued, the transport stopped, the clock on negative beats.
    tick(-2, { [BASS]: { queued: 'loop' } }, false, { countIn: { barsLeft: 1, beat: -2 } })
    expect(useRecordStore.getState().takes[BASS]).toMatchObject({ kind: 'overdub', state: 'queued' })
    expect(countInBars()).toBe(0)
    on(BASS, -0.1); off(BASS, 0.5)
    tick(0.1, { [BASS]: { playingClipId: 'loop', startBeat: 0 } })
    expect(notes(BASS, 0)).toEqual([[60, 0, 0.5]])
  })

  it('a relaunch or a new length ends the take and opens another', () => {
    const playing = loop()
    tick(5, { [BASS]: playing })
    rec(true)
    const first = useRecordStore.getState().takes[BASS]!.id
    on(BASS, 6); off(BASS, 6.5)
    // A note held over the relaunch boundary is closed there, and not doubled in the new take.
    on(BASS, 11.5, 64)
    tick(12.05, { [BASS]: { playingClipId: 'loop', startBeat: 12 } })
    const second = useRecordStore.getState().takes[BASS]!.id
    expect(second).not.toBe(first)
    off(BASS, 12.5, 64)
    on(BASS, 13, 62); off(BASS, 13.5, 62)
    expect(notes(BASS, 0).sort((a, b) => a[1]! - b[1]!)).toEqual([[62, 1, 0.5], [60, 2, 0.5], [64, 7.5, 0.5]])
    useProjectStore.getState().setClipLength({ kind: 'session', trackId: BASS, clipId: 'loop' }, 4)
    tick(13.6, { [BASS]: { playingClipId: 'loop', startBeat: 12 } })
    expect(useRecordStore.getState().takes[BASS]?.id).not.toBe(second)
  })

  it('a slot take ending with ● Rec on goes on overdubbing its clip, with nothing doubled', () => {
    useRecordStore.getState().arm(BASS, true)
    rec(true)
    const { start, playing } = startTake(BASS, 1, 1)
    tick(start + 0.1, { [BASS]: playing })
    on(BASS, start + 1); off(BASS, start + 1.5)
    endTake(BASS)
    // Ends at start + 4: a note just before the end is the slot take's, one just after is the overdub's.
    on(BASS, start + 3.9, 62); off(BASS, start + 3.95, 62)
    on(BASS, start + 4.02, 64)
    tick(start + 4.05, { [BASS]: playing })
    expect(useRecordStore.getState().takes[BASS]).toMatchObject({ kind: 'overdub' })
    off(BASS, start + 4.5, 64)
    expect(notes(BASS, 1).map(([pitch, at]) => [pitch, +at!.toFixed(3)]).sort((a, b) => a[1]! - b[1]!)).toEqual([[64, 0.02], [60, 1], [62, 3.9]])
  })

  it('ends when the track is disarmed, the clip stops, or the transport stops', () => {
    const playing = loop()
    tick(5, { [BASS]: playing })
    rec(true)
    useRecordStore.getState().arm(BASS, false)
    expect(useRecordStore.getState().takes[BASS]).toBeUndefined()
    useRecordStore.getState().arm(BASS, true)
    expect(useRecordStore.getState().takes[BASS]).toBeDefined()
    tick(8.1, { [BASS]: { stopBeat: 8 } })
    expect(useRecordStore.getState().takes[BASS]).toBeUndefined()
    tick(9, { [BASS]: playing })
    expect(useRecordStore.getState().takes[BASS]).toBeDefined()
    stopTakes(9.5)
    expect(useRecordStore.getState().takes[BASS]).toBeUndefined()
  })

  it('says when nothing is armed, and overdubs no clip while the Arrangement plays', () => {
    rec(true)
    expect(useRecordStore.getState().feedback).toBe('Armed tracks: none')
    rec(false)
    const playing = loop()
    tick(5, { [BASS]: playing }, true, { mode: 'arrangement' })
    rec(true)
    // The Arrangement records the armed track into a region instead (record-arrangement.test.ts).
    expect(useRecordStore.getState().takes[BASS]?.kind).toBe('region')
  })
})

describe('count-in', () => {
  beforeEach(() => {
    useRecordStore.getState().arm(BASS, true)
    useRecordSettings.setState({ countInBars: 2 })
  })

  it('counts in a slot take, or any start with ● Rec on, only from a stopped transport', () => {
    expect(countInBars()).toBe(0)
    recordInSlot(BASS, 0, vi.fn())
    const clip = clipIn(BASS, 0)!
    expect(countInBars({ trackId: BASS, clipId: clip.id })).toBe(2)
    expect(countInBars({ trackId: BASS, clipId: 'other' })).toBe(0)
    useRecordStore.getState().setRec(true)
    expect(countInBars()).toBe(2)
    tick(1, {})
    expect(countInBars()).toBe(0)
    useRecordSettings.setState({ countInBars: 0 })
    tick(0, {}, false)
    expect(countInBars()).toBe(0)
  })

  it('■ during a count-in drops the take and the empty clip made for it', () => {
    recordInSlot(BASS, 0, vi.fn())
    const clip = clipIn(BASS, 0)!
    tick(-6, { [BASS]: { queued: clip.id } }, false, { countIn: { barsLeft: 2, beat: -6 } })
    expect(useRecordStore.getState().takes[BASS]).toBeDefined()
    stopTakes()
    expect(useRecordStore.getState().takes[BASS]).toBeUndefined()
    expect(clipIn(BASS, 0)).toBeNull()
    expect(useRecordStore.getState().feedback).toBe('Count-in stopped: nothing recorded')
  })

  it('a take waits through a long count-in, and keeps a note played just before its first beat', () => {
    vi.useFakeTimers()
    try {
      recordInSlot(BASS, 0, vi.fn())
      const clip = clipIn(BASS, 0)!
      tick(-7, { [BASS]: { queued: clip.id } }, false, { countIn: { barsLeft: 2, beat: -7 } })
      vi.advanceTimersByTime(5000)
      tick(-0.5, { [BASS]: { queued: clip.id } }, false, { countIn: { barsLeft: 1, beat: -0.5 } })
      on(BASS, -0.1); off(BASS, 0.4)
      tick(0.05, { [BASS]: { playingClipId: clip.id, startBeat: 0 } })
      expect(notes(BASS, 0)).toEqual([[60, 0, 0.4]])
    } finally { vi.useRealTimers() }
  })
})
