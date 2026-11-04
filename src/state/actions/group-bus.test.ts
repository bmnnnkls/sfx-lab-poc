import { type LibraryCatalog, addTrack, captureLibraryAsset, createReturnTrack, emptyLibrary, groupTrack, saveProjectPreset, setGroupBus } from '@core'
import { beforeEach, describe, expect, it } from 'vitest'
import type { PersonalLibrary } from '../library'
import { useLibraryStore } from '../library-store'
import { useProjectStore } from '../project-store'
import { useSelectionStore } from '../selection-store'
import { describeActions, runAction, type Subject } from '.'
import { type DragPayload, type DropTarget, dropFor, runDrop } from './drops'
import { fakeContext, loadDemo } from './test-support'

const project = () => useProjectStore.getState().project
const track = (name: string) => project().tracks.find((candidate) => candidate.name === name)!
const group = (name: string) => project().groups!.find((candidate) => candidate.name === name)!
const subject = (name: string): Subject => ({ kind: 'group', groupId: group(name).id })
const items = (name: string) => describeActions(subject(name), fakeContext())
const titles = (name: string) => items(name).map((item) => item.title)
const undoSteps = () => useProjectStore.getState().history.past.length
const onGroup = (name: string): DropTarget => ({ kind: 'group', groupId: group(name).id })
const accepted = (payload: DragPayload, target: DropTarget) => dropFor(payload, target, fakeContext())?.id

/** The demo with a return; Bass in Drums (a bus), Lead in Keys (a folder). */
beforeEach(() => {
  let next = addTrack(loadDemo(), { ...createReturnTrack('Return A'), id: 'ret' })
  const drums = groupTrack(next, next.tracks.find((candidate) => candidate.name === 'Bass')!.id)
  const keys = groupTrack(drums.project, drums.project.tracks.find((candidate) => candidate.name === 'Lead')!.id)
  next = { ...keys.project, groups: keys.project.groups!.map((candidate) => ({ ...candidate, name: candidate.id === drums.groupId ? 'Drums' : 'Keys' })) }
  useProjectStore.getState().resetProject(setGroupBus(next, drums.groupId!, true))
  useSelectionStore.getState().reset()
})

describe('the group menu with buses', () => {
  it('offers a folder Sum to a bus, Mute and Solo', () => {
    expect(titles('Keys')).toEqual(['Collapse', 'Rename', 'Sum to a bus', 'Mute', 'Solo', 'Colour', 'Move up', 'Move down', 'Hide tracks', 'Ungroup', 'Delete group and tracks'])
    expect(items('Keys').find((item) => item.id === 'group.bus')!.tooltip).toMatch(/fader, effects and sends/)
  })

  it('offers a bus Open effects and Remove bus, which says it discards the effects', () => {
    expect(titles('Drums')).toEqual(['Collapse', 'Open effects', 'Pin effects panel', 'Rename', 'Remove bus', 'Save effects to library', 'Mute', 'Solo', 'Colour', 'Move up', 'Move down', 'Hide tracks', 'Ungroup', 'Delete group and tracks'])
    expect(items('Drums').find((item) => item.id === 'group.bus')!.tooltip).toMatch(/discard the bus's effects/)
  })

  it('makes and removes a bus, one undo step each, and undo brings it back', () => {
    runAction('group.bus', subject('Keys'), fakeContext())
    expect(group('Keys').bus).toBeDefined()
    expect(undoSteps()).toBe(1)
    runAction('group.bus', subject('Drums'), fakeContext())
    expect(group('Drums').bus).toBeUndefined()
    expect(undoSteps()).toBe(2)
    useProjectStore.getState().undo()
    expect(group('Drums').bus?.fx.nodes.map((node) => node.type)).toEqual(['groupIn', 'trackOut'])
  })

  it('mutes and solos a group, one undo step each', () => {
    runAction('group.mute', subject('Keys'), fakeContext())
    expect(group('Keys').muted).toBe(true)
    expect(titles('Keys')).toContain('Unmute')
    runAction('group.solo', subject('Drums'), fakeContext())
    expect(group('Drums').soloed).toBe(true)
    expect(titles('Drums')).toContain('Unsolo')
    expect(undoSteps()).toBe(2)
  })

  it('opens a bus\'s effects by selecting the group', () => {
    runAction('group.open-effects', subject('Drums'), fakeContext())
    expect(useSelectionStore.getState()).toMatchObject({ groupId: group('Drums').id, trackId: null, master: false })
    useSelectionStore.getState().selectTrack(track('Bass').id)
    expect(useSelectionStore.getState().groupId).toBeNull()
  })

  it('offers no automation on a group\'s controls', () => {
    const fader = { kind: 'control' as const, targets: [{ kind: 'mixer' as const, owner: { kind: 'group' as const, groupId: group('Drums').id }, control: 'volume' as const }] }
    const entries = describeActions(fader, fakeContext())
    expect(entries.find((item) => item.id === 'control.show-automation')!.choices![0]!.enabled).toBe(false)
    expect(entries.find((item) => item.id === 'control.midi-learn')!.choices![0]!.enabled).toBe(true)
  })
})

describe('drops on a group', () => {
  const inserted: string[] = []
  const library = {
    insert: async (item: { name: string }, destination: { mode: string; scope?: unknown }) => {
      inserted.push(`${item.name} ${JSON.stringify(destination.scope)}`)
      return `${item.name} copied into project`
    },
  } as unknown as PersonalLibrary

  beforeEach(() => {
    inserted.length = 0
    const owner = { kind: 'group' as const, groupId: group('Drums').id }
    let catalog: LibraryCatalog = captureLibraryAsset(emptyLibrary(), project(), { owner, domain: 'fx' }, 'Bus fx', null)
    catalog = captureLibraryAsset(catalog, project(), { owner: { kind: 'track', trackId: track('Bass').id }, domain: 'fx' }, 'Track fx', null)
    useLibraryStore.setState({ catalog, openFolder: null })
  })

  const item = (name: string): DragPayload => ({ kind: 'library-item', itemId: useLibraryStore.getState().catalog.items.find((entry) => entry.name === name)!.id })

  it('put a Group in effect on a bus, not on a folder or a track', async () => {
    expect(accepted(item('Bus fx'), onGroup('Drums'))).toBe('drop.library-item-on-group')
    expect(accepted(item('Bus fx'), onGroup('Keys'))).toBeUndefined()
    expect(accepted(item('Bus fx'), { kind: 'track', trackId: track('Pad').id })).toBeUndefined()
    expect(accepted(item('Track fx'), onGroup('Drums'))).toBeUndefined()
    await runDrop(item('Bus fx'), onGroup('Drums'), fakeContext({ library }), { alt: false })
    expect(inserted).toEqual([`Bus fx {"owner":{"kind":"group","groupId":"${group('Drums').id}"},"domain":"fx"}`])
  })

  it('recall a bus\'s effects preset onto a bus, not onto a folder', () => {
    const owner = { kind: 'group' as const, groupId: group('Drums').id }
    useProjectStore.getState().resetProject(saveProjectPreset(project(), { owner, domain: 'fx' }, 'Glue'))
    const glue: DragPayload = { kind: 'sound', soundId: project().presets!.find((entry) => entry.name === 'Glue')!.id, preset: true }
    expect(accepted(glue, onGroup('Drums'))).toBe('drop.sound-on-group')
    expect(accepted(glue, { kind: 'group', groupId: group('Drums').id, edge: 'before' })).toBe('drop.sound-on-group')
    expect(accepted(glue, onGroup('Keys'))).toBeUndefined()
  })
})
