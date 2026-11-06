import { describe, expect, it } from 'vitest'
import { parseProject, serializeProject } from '../persistence'
import { diffProject } from '../sync'
import { createDemoProject } from './demo-project'
import { setTrackVoices } from './edit'
import { duplicateTrack } from './track-duplicate'
import { liveNoteRouting, liveNoteTracks, setTrackBendRange, setTrackMidiInput, trackBendRange } from './midi-routes'
import type { Project } from './types'

const project = createDemoProject()
const [a, b, c] = project.tracks.filter((track) => track.kind === 'instrument').map((track) => track.id) as [string, string, string]
const follow = (trackId: string | null, channel: number | null = null, armed: readonly string[] = []) => ({ trackId, channel, armed })

describe('liveNoteTracks', () => {
  it('follows the selection while no track has an input of its own', () => {
    expect(liveNoteTracks(project, 'keys', 0, follow(a))).toEqual([a])
    expect(liveNoteTracks(project, 'keys', 0, follow(null))).toEqual([])
    expect(liveNoteTracks(project, 'keys', 3, follow(a, 2))).toEqual([])
    expect(liveNoteTracks(project, 'keys', 2, follow(a, 2))).toEqual([a])
  })

  it('sends a note matching a track input to that track only, and the rest to the followed track', () => {
    const drums = setTrackMidiInput(project, b, { channel: 9 })
    expect(liveNoteTracks(drums, 'keys', 9, follow(a))).toEqual([b])
    expect(liveNoteTracks(drums, 'pads', 9, follow(a))).toEqual([b])
    expect(liveNoteTracks(drums, 'keys', 0, follow(a))).toEqual([a])
  })

  it('matches the device by id, and layers several tracks on one input', () => {
    const layered = setTrackMidiInput(setTrackMidiInput(project, b, { deviceId: 'pads', deviceName: 'Pads' }), c, { deviceId: 'pads', channel: 0 })
    expect(liveNoteTracks(layered, 'pads', 0, follow(a))).toEqual([b, c])
    expect(liveNoteTracks(layered, 'pads', 1, follow(a))).toEqual([b])
    expect(liveNoteTracks(layered, 'keys', 0, follow(a))).toEqual([a])
  })

  it('a followed track with its own input listens only to that input', () => {
    const own = setTrackMidiInput(project, a, { channel: 4 })
    expect(liveNoteTracks(own, 'keys', 0, follow(a))).toEqual([])
    expect(liveNoteTracks(own, 'keys', 4, follow(b))).toEqual([a])
  })
})

describe('liveNoteTracks with armed tracks', () => {
  it('layers an armed follower with the selected track, each once', () => {
    expect(liveNoteTracks(project, 'keys', 0, follow(a, null, [b]))).toEqual([a, b])
    expect(liveNoteTracks(project, 'keys', 0, follow(a, null, [a, b, b]))).toEqual([a, b])
    // Recording a track never needs it selected.
    expect(liveNoteTracks(project, 'keys', 0, follow(null, null, [c]))).toEqual([c])
  })

  it('applies the follow channel to armed followers too', () => {
    expect(liveNoteTracks(project, 'keys', 3, follow(a, 2, [b]))).toEqual([])
    expect(liveNoteTracks(project, 'keys', 2, follow(a, 2, [b]))).toEqual([a, b])
  })

  it('leaves a track with its own input to its rule, and gives a matched note only to those inputs', () => {
    const own = setTrackMidiInput(project, b, { channel: 9 })
    expect(liveNoteTracks(own, 'keys', 0, follow(a, null, [b, c]))).toEqual([a, c])
    expect(liveNoteTracks(own, 'keys', 9, follow(a, null, [b, c]))).toEqual([b])
  })

  it('ignores armed ids that are not instrument tracks', () => {
    const other = project.tracks.find((track) => track.kind !== 'instrument')
    expect(liveNoteTracks(project, 'keys', 0, follow(a, null, ['nothing', ...(other ? [other.id] : [])]))).toEqual([a])
  })

  it('re-routes held notes when arming or disarming', () => {
    expect(liveNoteRouting(project, follow(a, null, [b]))).not.toBe(liveNoteRouting(project, follow(a)))
    expect(liveNoteRouting(project, follow(a, null, ['nothing']))).toBe(liveNoteRouting(project, follow(a)))
  })
})

describe('setTrackMidiInput', () => {
  it('sets, replaces and clears, and is the same project when nothing changes', () => {
    const set = setTrackMidiInput(project, a, { deviceId: 'keys', deviceName: 'Keys', channel: 1 })
    expect(set.tracks.find((track) => track.id === a)).toMatchObject({ midiInput: { deviceId: 'keys', deviceName: 'Keys', channel: 1 } })
    expect(setTrackMidiInput(set, a, { deviceId: 'keys', deviceName: 'Keys', channel: 1 })).toBe(set)
    const cleared = setTrackMidiInput(set, a, undefined)
    expect(cleared.tracks.find((track) => track.id === a)).not.toHaveProperty('midiInput')
    expect(setTrackMidiInput(cleared, a, undefined)).toBe(cleared)
  })

  it('refuses a malformed channel rather than widening it to any channel', () => {
    const bad = setTrackMidiInput(project, a, { channel: 16 })
    expect(bad).toBe(project)
  })

  it('sends nothing to the engine, and changes where notes go', () => {
    const set = setTrackMidiInput(project, a, {})
    expect(diffProject(project, set)).toEqual([])
    expect(liveNoteRouting(set, follow(a))).not.toBe(liveNoteRouting(project, follow(a)))
    expect(liveNoteRouting(setTrackVoices(project, a, 3), follow(a))).toBe(liveNoteRouting(project, follow(a)))
  })
})

describe('the file', () => {
  const roundTrip = (value: Project) => {
    const result = parseProject(serializeProject(value))
    if (!result.ok) throw new Error('did not load')
    return result
  }

  it('keeps a track input, and an old track without one follows the selection', () => {
    const set = setTrackMidiInput(project, a, { deviceId: 'keys', deviceName: 'Keys', channel: 9 })
    const loaded = roundTrip(set).project
    expect(loaded.tracks.find((track) => track.id === a)).toMatchObject({ midiInput: { deviceId: 'keys', deviceName: 'Keys', channel: 9 } })
    expect(loaded.tracks.find((track) => track.id === b)).not.toHaveProperty('midiInput')
  })

  it('drops a malformed input with a warning', () => {
    const raw = JSON.parse(serializeProject(project))
    raw.project.tracks.find((track: { id: string }) => track.id === a).midiInput = { channel: 'ten' }
    const result = parseProject(JSON.stringify(raw))
    if (!result.ok) throw new Error('did not load')
    expect(result.project.tracks.find((track) => track.id === a)).not.toHaveProperty('midiInput')
    expect(result.warnings.some((warning) => warning.includes('invalid MIDI input'))).toBe(true)
  })
})

describe('the bend range', () => {
  const instrument = (value: Project, id: string) => value.tracks.find((track) => track.id === id)
  const range = (value: Project, id: string) => {
    const track = instrument(value, id)
    return track?.kind === 'instrument' ? trackBendRange(track) : undefined
  }

  it('is 2 by default, kept as no field, and rounded and clamped when set', () => {
    expect(range(project, a)).toBe(2)
    expect(range(setTrackBendRange(project, a, 12.4), a)).toBe(12)
    expect(range(setTrackBendRange(project, a, 40), a)).toBe(24)
    expect(range(setTrackBendRange(project, a, -1), a)).toBe(0)
    expect(instrument(setTrackBendRange(setTrackBendRange(project, a, 7), a, 2), a)).not.toHaveProperty('bendRange')
    expect(setTrackBendRange(project, a, 2)).toBe(project)
  })

  it('reaches the engine on a change and with a new track', () => {
    const set = setTrackBendRange(project, a, 12)
    expect(diffProject(project, set)).toEqual([{ type: 'track/setBendRange', trackId: a, bendRange: 12 }])
    expect(diffProject(null, set).find((command) => command.type === 'track/add' && command.trackId === a)).toMatchObject({ bendRange: 12 })
  })

  it('is saved, loaded and copied by Duplicate; a malformed one is dropped with a warning', () => {
    const set = setTrackBendRange(project, a, 7)
    const result = parseProject(serializeProject(set))
    if (!result.ok) throw new Error('did not load')
    expect(instrument(result.project, a)).toMatchObject({ bendRange: 7 })
    expect(instrument(result.project, b)).not.toHaveProperty('bendRange')
    const copied = duplicateTrack(set, a)
    expect(copied.project.tracks.filter((track) => track.kind === 'instrument' && track.bendRange === 7)).toHaveLength(2)

    for (const bad of [2.5, 30, -1, 'ten']) {
      const raw = JSON.parse(serializeProject(project))
      raw.project.tracks.find((track: { id: string }) => track.id === a).bendRange = bad
      const loaded = parseProject(JSON.stringify(raw))
      if (!loaded.ok) throw new Error('did not load')
      expect(instrument(loaded.project, a)).not.toHaveProperty('bendRange')
      expect(loaded.warnings.some((warning) => warning.includes('invalid bend range'))).toBe(true)
    }
  })
})
