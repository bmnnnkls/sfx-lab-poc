import { addTrack, createAudioTrack, createClip, createEmptyProject, createNote, createReturnTrack, createTrack, setClipAt } from '@core'
import { describe, expect, it } from 'vitest'
import { barsOf, barsText, initialForm, optionsOf, readNumber, sceneClipCount, scopeOf, selectedClipChoice } from './export-model'

const clip = createClip('Riff', 8, [createNote(60, 0, 1)])
const track = createTrack('Bass', 4)
const project = setClipAt(addTrack({ ...createEmptyProject(), tracks: [] }, track), track.id, 1, clip)

describe('export dialog model', () => {
  it('offers the open clip only when it is a clip of the project', () => {
    expect(selectedClipChoice(project, track.id, clip.id)).toEqual({ scope: { kind: 'clip', trackId: track.id, clipId: clip.id }, label: 'Bass: Riff' })
    expect(selectedClipChoice(project, track.id, 'gone')).toBeNull()
    expect(selectedClipChoice(project, 'gone', clip.id)).toBeNull()
    expect(selectedClipChoice(project, null, null)).toBeNull()
    const verb = createReturnTrack('Verb')
    expect(selectedClipChoice(addTrack(project, verb), verb.id, clip.id)).toBeNull()
  })

  it('counts the clips of a scene, audio tracks too, and leaves empty rows out', () => {
    const audio = createAudioTrack('Loop', 4)
    expect([0, 1, 2].map((scene) => sceneClipCount(project, scene))).toEqual([0, 1, 0])
    expect(sceneClipCount(addTrack(project, audio), 1)).toBe(1)
  })

  it('starts on the open clip if there is one, else on the first scene', () => {
    expect(initialForm(true).scope).toBe('clip')
    expect(initialForm(false).scope).toBe('scene')
  })

  it('has no scope where there is nothing to play', () => {
    const choice = selectedClipChoice(project, track.id, clip.id)
    expect(scopeOf({ ...initialForm(true), scope: 'clip' }, project, choice)).toEqual(choice?.scope)
    expect(scopeOf({ ...initialForm(true), scope: 'clip' }, project, null)).toBeNull()
    expect(scopeOf({ ...initialForm(false), scene: 1 }, project, null)).toEqual({ kind: 'scene', scene: 1 })
    expect(scopeOf({ ...initialForm(false), scene: 0 }, project, null)).toBeNull()
  })

  it('bars follow the scope until typed, then stay within what a bounce accepts', () => {
    const scope = { kind: 'scene', scene: 1 } as const
    const form = { ...initialForm(false), scene: 1 }
    expect(barsText(form, project, scope)).toBe('2') // an 8-beat clip
    expect(barsOf(form, project, scope)).toBe(2)
    expect(barsOf({ ...form, bars: '3' }, project, scope)).toBe(3)
    expect(barsOf({ ...form, bars: '0' }, project, scope)).toBe(0.25)
    expect(barsOf({ ...form, bars: '9999' }, project, scope)).toBe(64)
    expect(barsOf({ ...form, bars: 'abc' }, project, scope)).toBe(2)
    expect(barsText({ ...form, bars: '1.' }, project, scope)).toBe('1.') // half-typed text is kept as typed
    expect(barsText(form, project, null)).toBe('')
  })

  it('reads numbers leniently', () => {
    expect(readNumber(' 4 ', 1)).toBe(4)
    expect(readNumber('', 7)).toBe(7)
    expect(readNumber(null, 7)).toBe(7)
    expect(readNumber('Infinity', 7)).toBe(7)
  })

  it('turns the form into bounce options', () => {
    const scope = { kind: 'scene', scene: 1 } as const
    expect(optionsOf({ ...initialForm(false), scene: 1 }, project, scope)).toEqual({
      scope, bars: 2, maxTail: 10, sampleRate: 48000, bitDepth: 16, normalize: false,
    })
    expect(optionsOf({ ...initialForm(false), scene: 1, tail: '-3', sampleRate: 44100, bitDepth: 32, normalize: true, bars: '1.5' }, project, scope)).toEqual({
      scope, bars: 1.5, maxTail: 0, sampleRate: 44100, bitDepth: 32, normalize: true,
    })
    expect(optionsOf({ ...initialForm(false), tail: '500' }, project, scope).maxTail).toBe(30)
  })
})
