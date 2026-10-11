import { describe, expect, it } from 'vitest'
import { createDemoProject } from './demo-project'
import {
  MAX_NOTE_EFFECTS,
  addNoteEffect,
  moveNoteEffect,
  removeNoteEffect,
  setNoteEffectBypassed,
  setNoteEffectParam,
} from './note-effect-edit'
import type { InstrumentTrack, Project } from './types'

const demo = createDemoProject()
const track = (project: Project, index = 0) => project.tracks[index] as InstrumentTrack
const bassId = track(demo).id

describe('MIDI effect chain edits', () => {
  it('tracks start with no effects', () => {
    expect(track(demo).noteEffects).toEqual([])
  })

  it('adds effects at the end with default parameters', () => {
    const project = addNoteEffect(addNoteEffect(demo, bassId, 'arpeggiator'), bassId, 'transpose')
    expect(track(project).noteEffects.map((effect) => effect.type)).toEqual(['arpeggiator', 'transpose'])
    expect(track(project).noteEffects[0]!.params).toMatchObject({ rate: 1, pattern: 0, octaves: 1 })
    expect(track(project, 1).noteEffects).toEqual([]) // other tracks untouched
  })

  it('ignores unknown types and tracks that are not instruments', () => {
    expect(addNoteEffect(demo, bassId, 'nope')).toBe(demo)
    expect(addNoteEffect(demo, 'missing', 'chord')).toBe(demo)
  })

  it('caps the length of a chain', () => {
    let project = demo
    for (let i = 0; i < MAX_NOTE_EFFECTS + 3; i++) project = addNoteEffect(project, bassId, 'transpose')
    expect(track(project).noteEffects).toHaveLength(MAX_NOTE_EFFECTS)
  })

  it('removes and reorders', () => {
    let project = ['scaleLock', 'chord', 'echo'].reduce((p, type) => addNoteEffect(p, bassId, type), demo)
    const [a, b, c] = track(project).noteEffects
    project = moveNoteEffect(project, bassId, c!.id, -2)
    expect(track(project).noteEffects.map((e) => e.id)).toEqual([c!.id, a!.id, b!.id])
    project = removeNoteEffect(project, bassId, a!.id)
    expect(track(project).noteEffects.map((e) => e.id)).toEqual([c!.id, b!.id])
    expect(moveNoteEffect(project, bassId, c!.id, -1)).toBe(project) // already first
    expect(removeNoteEffect(project, bassId, 'nope')).toBe(project)
  })

  it('sets parameters within their range, and keeps identity for no-ops', () => {
    const project = addNoteEffect(demo, bassId, 'transpose')
    const id = track(project).noteEffects[0]!.id
    const up = setNoteEffectParam(project, bassId, id, 'semitones', 99)
    expect(track(up).noteEffects[0]!.params.semitones).toBe(24)
    expect(setNoteEffectParam(up, bassId, id, 'semitones', 24)).toBe(up)
    expect(setNoteEffectParam(up, bassId, id, 'nope', 1)).toBe(up)
  })

  it('bypasses', () => {
    const project = addNoteEffect(demo, bassId, 'chord')
    const id = track(project).noteEffects[0]!.id
    const off = setNoteEffectBypassed(project, bassId, id, true)
    expect(track(off).noteEffects[0]!.bypassed).toBe(true)
    expect(setNoteEffectBypassed(off, bassId, id, true)).toBe(off)
  })
})
