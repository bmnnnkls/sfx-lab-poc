import { describe, expect, it } from 'vitest'
import { commit, createHistory, undo } from '../history'
import { parseProject, serializeProject } from '../persistence'
import { addTrack, createDemoProject, createReturnTrack, MAX_SCENES } from './index'
import { duplicateScene, insertScene, removeScene } from './scenes'
import type { InstrumentTrack, Project, ReturnTrack } from './types'

/** The demo (Bass: Root, Walk; Lead: Arp, -, Hook; Pad: Cm, Ab) with named scenes and slots on the master and a return. */
const project = (): Project => {
  const demo = createDemoProject()
  const slot = (id: string) => ({ id, name: id, lengthBeats: 4, automation: [{ id: `lane-${id}`, target: { kind: 'mixer' as const, owner: { kind: 'master' as const }, control: 'volume' as const }, enabled: true, points: [{ id: `p-${id}`, beat: 0, value: 1, interpolation: 'linear' as const }] }] })
  return {
    ...addTrack(demo, { ...createReturnTrack('Return A'), id: 'ret', automationSlots: [null, slot('r1')] }),
    sceneNames: ['Intro', 'Verse'],
    master: { ...demo.master, automationSlots: [slot('m0')] },
  }
}
const names = (p: Project, track: number) => (p.tracks[track] as InstrumentTrack).clips.map((clip) => clip?.name ?? null)
const ret = (p: Project) => p.tracks[3] as ReturnTrack
const roundTrip = (p: Project) => {
  const result = parseProject(serializeProject(p))
  if (!result.ok) throw new Error(result.error)
  return result.project
}

describe('scenes', () => {
  it('inserts an empty scene, shifting every scene-indexed list', () => {
    const inserted = insertScene(project(), 1)
    expect(inserted.sceneCount).toBe(5)
    expect(names(inserted, 0)).toEqual(['Root', null, 'Walk', null, null])
    expect(names(inserted, 1)).toEqual(['Arp', null, null, 'Hook', null])
    expect(inserted.sceneNames).toEqual(['Intro', '', 'Verse'])
    expect(inserted.master.automationSlots?.map((slot) => slot?.id ?? null)).toEqual(['m0', null])
    expect(ret(inserted).automationSlots?.map((slot) => slot?.id ?? null)).toEqual([null, null, 'r1'])
    expect(roundTrip(inserted).sceneCount).toBe(5)
  })

  it('inserts at the end, leaving lists that end earlier alone', () => {
    const inserted = insertScene(project(), 4)
    expect(names(inserted, 0)).toEqual(['Root', 'Walk', null, null, null])
    expect(inserted.master.automationSlots?.length).toBe(1)
    expect(inserted.sceneNames).toEqual(['Intro', 'Verse'])
  })

  it('duplicates a row after itself, with fresh ids and its name', () => {
    const source = project()
    const doubled = duplicateScene(source, 1)
    expect(doubled.sceneCount).toBe(5)
    expect(names(doubled, 0)).toEqual(['Root', 'Walk', 'Walk', null, null])
    expect(names(doubled, 2)).toEqual(['Cm', 'Ab', 'Ab', null, null])
    const [walk, copy] = (doubled.tracks[0] as InstrumentTrack).clips.slice(1, 3)
    expect(copy!.id).not.toBe(walk!.id)
    expect(copy!.notes.map((note) => note.id)).not.toContain(walk!.notes[0]!.id)
    expect(copy!.notes.map((note) => note.pitch)).toEqual(walk!.notes.map((note) => note.pitch))
    expect(doubled.sceneNames).toEqual(['Intro', 'Verse', 'Verse'])
    const slots = ret(doubled).automationSlots!
    expect(slots.map((slot) => slot?.name ?? null)).toEqual([null, 'r1', 'r1'])
    expect(slots[2]!.id).not.toBe('r1')
    expect(slots[2]!.automation![0]!.id).not.toBe('lane-r1')
    expect(roundTrip(doubled).tracks[0]).toEqual(doubled.tracks[0])
  })

  it('removes a row and what is in it', () => {
    const removed = removeScene(project(), 0)
    expect(removed.sceneCount).toBe(3)
    expect(names(removed, 0)).toEqual(['Walk', null, null])
    expect(names(removed, 1)).toEqual([null, 'Hook', null])
    expect(removed.sceneNames).toEqual(['Verse'])
    expect(removed.master.automationSlots).toEqual([])
    expect(ret(removed).automationSlots?.map((slot) => slot?.id ?? null)).toEqual(['r1'])
    expect(removeScene(removeScene(project(), 0), 0).sceneNames).toBeUndefined()
  })

  it('keeps one scene at least and 64 at most', () => {
    let small = project()
    while (small.sceneCount > 1) small = removeScene(small, 0)
    expect(removeScene(small, 0)).toBe(small)
    let big = project()
    while (big.sceneCount < MAX_SCENES) big = insertScene(big, 0)
    expect(insertScene(big, 0)).toBe(big)
    expect(duplicateScene(big, 0)).toBe(big)
  })

  it('refuses scenes outside the grid', () => {
    const source = project()
    expect(insertScene(source, 5)).toBe(source)
    expect(duplicateScene(source, 4)).toBe(source)
    expect(removeScene(source, -1)).toBe(source)
  })

  it('is one undo step', () => {
    const source = project()
    const history = commit(createHistory(source), duplicateScene(source, 0), { now: 0 })
    expect(history.past).toHaveLength(1)
    expect(undo(history).present).toBe(source)
  })
})
