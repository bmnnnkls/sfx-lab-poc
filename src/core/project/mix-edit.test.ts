import { describe, expect, it } from 'vitest'
import { commit, createHistory, undo } from '../history'
import {
  addTrack,
  createDemoProject,
  createReturnTrack,
  panOf,
  setMasterVolume,
  setTrackMuted,
  setTrackPan,
  setTrackSoloed,
} from './index'

const ret = createReturnTrack('Return A')
const project = addTrack(createDemoProject(), ret)
const bass = project.tracks[0]!
const find = (p: typeof project, id: string) => p.tracks.find((track) => track.id === id)!

describe('pan, mute and solo', () => {
  it('start at the centre, unmuted and not soloed, without any field in the project', () => {
    for (const track of project.tracks) {
      expect(panOf(track)).toBe(0)
      expect(track.muted).toBeUndefined()
      expect(track.soloed).toBeUndefined()
    }
    expect(project.master.volume).toBeUndefined()
  })

  it('set a pan clamped to -1..1, on any kind of track', () => {
    expect(panOf(find(setTrackPan(project, bass.id, 0.4), bass.id))).toBe(0.4)
    expect(panOf(find(setTrackPan(project, bass.id, -7), bass.id))).toBe(-1)
    expect(panOf(find(setTrackPan(project, ret.id, 7), ret.id))).toBe(1)
  })

  it('go back to the default by removing the field, so a centred track saves like one never panned', () => {
    const panned = setTrackPan(project, bass.id, 0.4)
    expect(find(setTrackPan(panned, bass.id, 0), bass.id)).toEqual(bass)
    expect(find(setTrackMuted(setTrackMuted(project, bass.id, true), bass.id, false), bass.id)).toEqual(bass)
    expect(find(setTrackSoloed(setTrackSoloed(project, bass.id, true), bass.id, false), bass.id)).toEqual(bass)
  })

  it('mute and solo are independent of each other', () => {
    const both = setTrackSoloed(setTrackMuted(project, bass.id, true), bass.id, true)
    expect(find(both, bass.id)).toMatchObject({ muted: true, soloed: true })
    expect(find(setTrackMuted(both, bass.id, false), bass.id)).toMatchObject({ soloed: true })
    expect(find(setTrackMuted(both, bass.id, false), bass.id).muted).toBeUndefined()
  })

  it('a change that changes nothing keeps the same project (no empty undo step)', () => {
    expect(setTrackPan(project, bass.id, 0)).toBe(project)
    expect(setTrackMuted(project, bass.id, false)).toBe(project)
    expect(setTrackSoloed(project, bass.id, false)).toBe(project)
    expect(setTrackPan(project, 'ghost', 0.5)).toBe(project)
    const muted = setTrackMuted(project, bass.id, true)
    expect(setTrackMuted(muted, bass.id, true)).toBe(muted)
    const panned = setTrackPan(project, bass.id, 0.5)
    expect(setTrackPan(panned, bass.id, 0.5)).toBe(panned)
  })

  it('undo brings the previous state back', () => {
    const muted = setTrackMuted(project, bass.id, true)
    const history = commit(createHistory(project), muted, { key: undefined, now: 0 })
    expect(undo(history).present).toBe(project)
  })
})

describe('master volume', () => {
  it('is clamped to 0..1 and absent at the default of 1', () => {
    expect(setMasterVolume(project, 0.3).master.volume).toBe(0.3)
    expect(setMasterVolume(project, 9)).toBe(project)
    expect(setMasterVolume(project, -1).master.volume).toBe(0)
    expect(setMasterVolume(setMasterVolume(project, 0.3), 1)).toEqual(project)
  })

  it('keeps the same project when nothing changes, and the master graph', () => {
    const half = setMasterVolume(project, 0.5)
    expect(setMasterVolume(half, 0.5)).toBe(half)
    expect(half.master.fx).toBe(project.master.fx)
  })
})
