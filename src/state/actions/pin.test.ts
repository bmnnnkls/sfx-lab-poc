import { type ControlOwner, MAX_PINS, type PanelPin, addTrack, createReturnTrack, groupTrack, pinKey, setGroupBus } from '@core'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGraphViewStore } from '../graph-view-store'
import { useLayoutStore } from '../layout-store'
import { useProjectStore } from '../project-store'
import { useSelectionStore } from '../selection-store'
import { type ActionItem, describeActions, runAction, type Subject } from '.'
import { fakeContext, loadDemo } from './test-support'

const project = () => useProjectStore.getState().project
const track = (name: string) => project().tracks.find((candidate) => candidate.name === name)!
const group = (name: string) => project().groups!.find((candidate) => candidate.name === name)!
const onTrack = (name: string): Subject => ({ kind: 'track', trackId: track(name).id })
const onGroup = (name: string): Subject => ({ kind: 'group', groupId: group(name).id })
const master: Subject = { kind: 'master' }
const pinOf = (owner: ControlOwner, graph: PanelPin['graph'] = 'fx'): Subject => ({ kind: 'pin', owner, graph })
const lead = (graph: PanelPin['graph']) => pinOf({ kind: 'track', trackId: track('Lead').id }, graph)
const items = (subject: Subject) => describeActions(subject, fakeContext())
const entry = (subject: Subject, id: string) => items(subject).find((item) => item.id === id)
/** The `open` group's entries, as a menu draws them: a submenu as `title ▸ choice, …`, inline choices one by one. */
const opens = (subject: Subject) =>
  items(subject)
    .filter((item) => item.group === 'open')
    .flatMap((item: ActionItem) =>
      !item.choices ? [item.title] : item.inline ? item.choices.map((choice) => choice.title) : [`${item.title} ▸ ${item.choices.map((choice) => `${choice.title}${choice.enabled === false ? ' (off)' : ''}`).join(', ')}`],
    )
const keys = () => (project().pins ?? []).map(pinKey)
const undoSteps = () => useProjectStore.getState().history.past.length

/** The demo (Bass, Lead, Pad, Kick) with a return; Bass in Drums (a bus), Lead in Keys (a folder). */
beforeEach(() => {
  let next = addTrack(loadDemo(), { ...createReturnTrack('Return A'), id: 'ret' })
  const drums = groupTrack(next, next.tracks.find((candidate) => candidate.name === 'Bass')!.id)
  const keys = groupTrack(drums.project, drums.project.tracks.find((candidate) => candidate.name === 'Lead')!.id)
  next = { ...keys.project, groups: keys.project.groups!.map((candidate) => ({ ...candidate, name: candidate.id === drums.groupId ? 'Drums' : 'Keys' })) }
  useProjectStore.getState().resetProject(setGroupBus(next, drums.groupId!, true))
  useSelectionStore.getState().reset()
  useGraphViewStore.getState().requestPin(null)
})

describe('pinning from menus', () => {
  it('offers an instrument track its three panels, and audio and return tracks their effects', () => {
    expect(opens(onTrack('Lead'))).toEqual(['Stop', 'Open instrument', 'Open effects', 'Open notes', 'Pin panel ▸ Instrument, Effects, Notes', 'Show automation'])
    expect(opens(onTrack('Kick'))).toEqual(['Stop', 'Open effects', 'Pin effects panel', 'Show automation'])
    expect(opens({ kind: 'track', trackId: 'ret' })).toEqual(['Open effects', 'Pin effects panel', 'Show automation'])
  })

  it('pins a panel, reveals it, and offers to unpin it', () => {
    runAction('track.pin', onTrack('Lead'), fakeContext(), { choice: 'notes' })
    expect(keys()).toEqual([`${track('Lead').id}:notes`])
    expect(useGraphViewStore.getState().pinRequest).toBe(`${track('Lead').id}:notes`)
    expect(opens(onTrack('Lead'))).toEqual(['Stop', 'Open instrument', 'Open effects', 'Open notes', 'Pin panel ▸ Instrument, Effects, Notes (off)', 'Unpin notes panel', 'Show automation'])
    runAction('track.pin', onTrack('Lead'), fakeContext(), { choice: 'patch' })
    expect(opens(onTrack('Lead'))).toContain('Unpin panel ▸ Instrument, Notes')
    runAction('track.unpin', onTrack('Lead'), fakeContext(), { choice: 'notes' })
    expect(keys()).toEqual([`${track('Lead').id}:patch`])
  })

  it('hides Pin on a track whose panels are all pinned', () => {
    runAction('track.pin', onTrack('Kick'), fakeContext(), { choice: 'fx' })
    expect(opens(onTrack('Kick'))).toEqual(['Stop', 'Open effects', 'Unpin effects panel', 'Show automation'])
    runAction('track.unpin', onTrack('Kick'), fakeContext(), { choice: 'fx' })
    expect(keys()).toEqual([])
  })

  it('offers a bus and the master a toggle, and a folder nothing', () => {
    expect(opens(onGroup('Drums'))).toEqual(['Collapse', 'Open effects', 'Pin effects panel'])
    expect(opens(onGroup('Keys'))).toEqual(['Collapse'])
    expect(opens(master)).toEqual(['Open effects', 'Pin effects panel', 'Show automation'])
    runAction('group.pin', onGroup('Drums'), fakeContext())
    runAction('master.pin', master, fakeContext())
    expect(keys()).toEqual([`${group('Drums').id}:fx`, 'master:fx'])
    expect(opens(onGroup('Drums'))).toContain('Unpin effects panel')
    runAction('master.pin', master, fakeContext())
    expect(keys()).toEqual([`${group('Drums').id}:fx`])
  })

  it('disables Pin at the limit, and says why', () => {
    const others = Array.from({ length: MAX_PINS }, (_, index): PanelPin => ({ owner: { kind: 'track', trackId: `gone${index}` }, graph: 'fx' }))
    useProjectStore.getState().resetProject({ ...project(), pins: others })
    expect(entry(onTrack('Lead'), 'track.pin')).toMatchObject({ title: `Pin panel — ${MAX_PINS} panels are pinned`, enabled: false })
    expect(entry(onTrack('Kick'), 'track.pin')!.choices![0]!.title).toBe(`Pin effects panel — ${MAX_PINS} panels are pinned`)
    expect(entry(master, 'master.pin')).toMatchObject({ title: `Pin effects panel — ${MAX_PINS} panels are pinned`, enabled: false })
    runAction('master.pin', master, fakeContext())
    expect(keys()).not.toContain('master:fx')
  })
})

describe('pins and undo', () => {
  it('pins and unpins without an undo step, and undo keeps the pins', () => {
    useProjectStore.getState().setTrackMuted(track('Pad').id, true)
    runAction('track.pin', onTrack('Lead'), fakeContext(), { choice: 'patch' })
    expect(undoSteps()).toBe(1)
    useProjectStore.getState().undo()
    expect(track('Pad').muted).toBeFalsy()
    expect(keys()).toEqual([`${track('Lead').id}:patch`])
    useProjectStore.getState().redo()
    expect(keys()).toEqual([`${track('Lead').id}:patch`])
  })

  it('keeps a removed track\'s pin, and shows it again on undo', () => {
    runAction('track.pin', onTrack('Lead'), fakeContext(), { choice: 'patch' })
    const id = track('Lead').id
    runAction('track.delete', onTrack('Lead'), fakeContext())
    expect(keys()).toEqual([`${id}:patch`])
    useProjectStore.getState().undo()
    expect(track('Lead').id).toBe(id)
    expect(keys()).toEqual([`${id}:patch`])
  })
})

describe('a pin\'s menu', () => {
  beforeEach(() => {
    for (const graph of ['patch', 'fx', 'notes'] as const) useProjectStore.getState().pinPanel({ owner: { kind: 'track', trackId: track('Lead').id }, graph })
  })

  it('offers Open, Collapse, the moves and Unpin; the ends disable a move', () => {
    expect(items(lead('patch')).map((item) => [item.title, item.enabled])).toEqual([['Open', true], ['Collapse', true], ['Move up', false], ['Move down', true], ['Unpin', true]])
    expect(entry(lead('patch'), 'pin.open')!.tooltip).toBe('Open the full editor')
    expect(entry(lead('notes'), 'pin.move-down')!.enabled).toBe(false)
    expect(entry(lead('notes'), 'pin.move-up')!.enabled).toBe(true)
    expect(entry(lead('notes'), 'pin.unpin')!.danger).toBe(false)
  })

  it('collapses, moves and unpins without undo steps', () => {
    runAction('pin.collapse', lead('fx'), fakeContext())
    expect(entry(lead('fx'), 'pin.collapse')!.title).toBe('Expand')
    runAction('pin.move-up', lead('fx'), fakeContext())
    const id = track('Lead').id
    expect(keys()).toEqual([`${id}:fx`, `${id}:patch`, `${id}:notes`])
    runAction('pin.unpin', lead('patch'), fakeContext())
    expect(keys()).toEqual([`${id}:fx`, `${id}:notes`])
    expect(project().pins![0]!.collapsed).toBe(true)
    expect(undoSteps()).toBe(0)
  })

  it('opens the editor of each kind of pin', () => {
    runAction('pin.open', lead('notes'), fakeContext())
    expect(useSelectionStore.getState().trackId).toBe(track('Lead').id)
    expect(useLayoutStore.getState().visible).toContain('notes')
    runAction('pin.open', pinOf({ kind: 'group', groupId: group('Drums').id }), fakeContext())
    expect(useSelectionStore.getState().groupId).toBe(group('Drums').id)
    runAction('pin.open', pinOf({ kind: 'master' }), fakeContext())
    expect(useSelectionStore.getState().master).toBe(true)
    expect(useLayoutStore.getState().visible).toContain('effects')
  })

  it('offers only Open on a graph that isn\'t pinned, and no Open on a pin whose graph is gone', () => {
    expect(items(pinOf({ kind: 'master' }))).toEqual([expect.objectContaining({ id: 'pin.open' })])
    const gone = lead('patch')
    useProjectStore.getState().removeTrack(track('Lead').id)
    expect(items(gone).map((item) => item.id)).toEqual(['pin.collapse', 'pin.move-up', 'pin.move-down', 'pin.unpin'])
  })
})
