import { describe, expect, it } from 'vitest'
import { addTrack, createAudioTrack, createReturnTrack, createDemoProject, removeTrack, setTrackSend, setTrackVolume } from './index'
import { commit, createHistory, undo } from '../history'
import type { Project } from './types'

const base = createDemoProject()
const ret = createReturnTrack('Return A')
const ret2 = createReturnTrack('Return B')
const project = addTrack(addTrack(base, ret), ret2)
const bass = project.tracks[0]!
const sendsOf = (p: Project, id: string) => {
  const track = p.tracks.find((t) => t.id === id)!
  return track.kind === 'return' ? undefined : track.sends
}

describe('send knobs', () => {
  it('start empty on every instrument and audio track', () => {
    expect(base.tracks.every((track) => track.kind === 'return' || Object.keys(track.sends).length === 0)).toBe(true)
    expect(createAudioTrack('x', 1).sends).toEqual({})
  })

  it('set how much goes to a return, clamped to 0..1', () => {
    expect(sendsOf(setTrackSend(project, bass.id, ret.id, 0.4), bass.id)).toEqual({ [ret.id]: 0.4 })
    expect(sendsOf(setTrackSend(project, bass.id, ret.id, 7), bass.id)).toEqual({ [ret.id]: 1 })
    expect(sendsOf(setTrackSend(project, bass.id, ret.id, -2), bass.id)).toEqual({})
  })

  it('one knob per return, independent of each other', () => {
    const both = setTrackSend(setTrackSend(project, bass.id, ret.id, 0.3), bass.id, ret2.id, 0.9)
    expect(sendsOf(both, bass.id)).toEqual({ [ret.id]: 0.3, [ret2.id]: 0.9 })
  })

  it('zero removes the entry, and a change that changes nothing keeps the same project (no empty undo step)', () => {
    const set = setTrackSend(project, bass.id, ret.id, 0.4)
    expect(sendsOf(setTrackSend(set, bass.id, ret.id, 0), bass.id)).toEqual({})
    expect(setTrackSend(set, bass.id, ret.id, 0.4)).toBe(set)
    expect(setTrackSend(project, bass.id, ret.id, 0)).toBe(project)
  })

  it('ignore return tracks as senders, and targets that are not return tracks', () => {
    expect(setTrackSend(project, ret.id, ret2.id, 0.5)).toBe(project)
    expect(setTrackSend(project, bass.id, base.tracks[1]!.id, 0.5)).toBe(project)
    expect(setTrackSend(project, bass.id, 'ghost', 0.5)).toBe(project)
  })

  it('are dropped with the return they point at, and come back with undo', () => {
    const set = setTrackSend(setTrackSend(project, bass.id, ret.id, 0.3), bass.id, ret2.id, 0.9)
    const history = commit(createHistory(set), removeTrack(set, ret.id), { key: undefined, now: 0 })
    expect(sendsOf(history.present, bass.id)).toEqual({ [ret2.id]: 0.9 })
    expect(sendsOf(undo(history).present, bass.id)).toEqual({ [ret.id]: 0.3, [ret2.id]: 0.9 })
  })

  it('are untouched by other edits', () => {
    const set = setTrackSend(project, bass.id, ret.id, 0.3)
    expect(sendsOf(setTrackVolume(set, bass.id, 0.1), bass.id)).toEqual({ [ret.id]: 0.3 })
  })
})
