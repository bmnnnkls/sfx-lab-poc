import { addTrack, createReturnTrack, trackRows, tracksInOrder } from '@core'
import { beforeEach, describe, expect, it } from 'vitest'
import { useProjectStore } from '../project-store'
import { useRenameStore } from '../rename-store'
import { useSelectionStore } from '../selection-store'
import { commitRename, describeActions, runAction, type Subject } from '.'
import { fakeContext, loadDemo } from './test-support'

const project = () => useProjectStore.getState().project
const track = (name: string) => project().tracks.find((candidate) => candidate.name === name)!
const trackSubject = (name: string): Subject => ({ kind: 'track', trackId: track(name).id })
const describe_ = (subject: Subject) => describeActions(subject, fakeContext())
const titles = (subject: Subject) => describe_(subject).map((item) => item.title)
const enabled = (subject: Subject, id: string) => describe_(subject).find((item) => item.id === id)?.enabled
const undoSteps = () => useProjectStore.getState().history.past.length
const names = () => tracksInOrder(project()).map((candidate) => candidate.name).join(' ')
const outline = () =>
  trackRows(project()).map((row) => '  '.repeat(row.depth) + (row.kind === 'group' ? `[${row.group.name}` : row.track.name)).join('\n')
const groupId = (name = 'Group 1') => project().groups!.find((group) => group.name === name)!.id
const groupSubject = (name = 'Group 1'): Subject => ({ kind: 'group', groupId: groupId(name) })

beforeEach(() => {
  const demo = loadDemo()
  useProjectStore.getState().resetProject(addTrack(demo, { ...createReturnTrack('Return A'), id: 'ret' }))
  useSelectionStore.getState().reset()
})

describe('grouping from the track menu', () => {
  it('groups a track, one undo step, and refuses a return', () => {
    expect(titles({ kind: 'track', trackId: 'ret' })).not.toContain('Group')
    runAction('track.group', trackSubject('Lead'), fakeContext())
    expect(outline()).toBe('Bass\n[Group 1\n  Lead\nPad\nKick\nReturn A')
    expect(undoSteps()).toBe(1)
  })

  it('moves a track into a group by its path, and out with No group', () => {
    expect(enabled(trackSubject('Bass'), 'track.move-to-group')).toBe(false)
    runAction('track.group', trackSubject('Lead'), fakeContext())
    runAction('track.group', trackSubject('Lead'), fakeContext())
    const choices = describe_(trackSubject('Bass')).find((item) => item.id === 'track.move-to-group')!.choices!
    expect(choices.map((choice) => choice.title)).toEqual(['Group 1', 'Group 1 / Group 2'])
    runAction('track.move-to-group', trackSubject('Bass'), fakeContext(), { choice: groupId('Group 2') })
    expect(outline()).toBe('[Group 1\n  [Group 2\n    Lead\n    Bass\nPad\nKick\nReturn A')
    expect(describe_(trackSubject('Bass')).find((item) => item.id === 'track.move-to-group')!.choices!.at(-1)).toEqual({ id: '-', title: 'No group' })
    runAction('track.move-to-group', trackSubject('Bass'), fakeContext(), { choice: '-' })
    expect(outline()).toBe('[Group 1\n  [Group 2\n    Lead\nBass\nPad\nKick\nReturn A')
  })

  it('moves tracks up and down at their level, returns among returns', () => {
    expect(enabled(trackSubject('Bass'), 'track.move-up')).toBe(false)
    runAction('track.move-down', trackSubject('Bass'), fakeContext())
    expect(names()).toBe('Lead Bass Pad Kick Return A')
    expect(enabled({ kind: 'track', trackId: 'ret' }, 'track.move-up')).toBe(false)
    expect(enabled({ kind: 'track', trackId: 'ret' }, 'track.move-down')).toBe(false)
    expect(enabled(trackSubject('Kick'), 'track.move-down')).toBe(false)
  })

  it('hides and shows a track without an undo step', () => {
    runAction('track.hide', trackSubject('Pad'), fakeContext())
    expect(track('Pad').hidden).toBe(true)
    expect(titles(trackSubject('Pad'))).toContain('Show')
    expect(undoSteps()).toBe(0)
  })
})

describe('group', () => {
  beforeEach(() => runAction('track.group', trackSubject('Lead'), fakeContext()))

  it('offers what applies to a group', () => {
    expect(titles(groupSubject())).toEqual(['Collapse', 'Rename', 'Colour', 'Move up', 'Move down', 'Hide tracks', 'Ungroup', 'Delete group and tracks'])
    expect(titles({ kind: 'group', groupId: 'gone' })).toEqual([])
  })

  it('collapses without an undo step, and an undo keeps it collapsed', () => {
    runAction('track.mute', trackSubject('Bass'), fakeContext())
    runAction('group.collapse', groupSubject(), fakeContext())
    expect(project().groups![0]!.collapsed).toBe(true)
    expect(titles(groupSubject())[0]).toBe('Expand')
    expect(undoSteps()).toBe(2)
    useProjectStore.getState().undo()
    expect(track('Bass').muted).toBeUndefined()
    expect(project().groups![0]!.collapsed).toBe(true)
    useProjectStore.getState().redo()
    expect(track('Bass').muted).toBe(true)
    expect(project().groups![0]!.collapsed).toBe(true)
  })

  it('renames in place and recolours, one undo step each', () => {
    runAction('group.rename', groupSubject(), fakeContext({ origin: 'session' }))
    expect(useRenameStore.getState().renaming).toMatchObject({ subject: groupSubject(), origin: 'session' })
    commitRename(groupSubject(), '  Leads ', fakeContext())
    expect(project().groups![0]!.name).toBe('Leads')
    runAction('group.colour', groupSubject('Leads'), fakeContext(), { choice: 'teal' })
    expect(project().groups![0]!.colour).toBe('teal')
    expect(undoSteps()).toBe(3)
    expect(describe_(groupSubject('Leads')).find((item) => item.id === 'group.colour')!.choices!.find((choice) => choice.id === 'teal')!.enabled).toBe(false)
  })

  it('hides and shows its tracks', () => {
    runAction('group.hide', groupSubject(), fakeContext())
    expect(track('Lead').hidden).toBe(true)
    expect(titles(groupSubject())).toContain('Show tracks')
    runAction('group.hide', groupSubject(), fakeContext())
    expect(track('Lead').hidden).toBeUndefined()
  })

  it('moves up and down with its tracks', () => {
    runAction('group.move-up', groupSubject(), fakeContext())
    expect(names()).toBe('Lead Bass Pad Kick Return A')
    expect(enabled(groupSubject(), 'group.move-up')).toBe(false)
  })

  it('ungroups, or deletes with its tracks, and undo brings them back', () => {
    runAction('group.ungroup', groupSubject(), fakeContext())
    expect(project().groups).toBeUndefined()
    expect(names()).toBe('Bass Lead Pad Kick Return A')
    useProjectStore.getState().undo()
    runAction('group.delete', groupSubject(), fakeContext())
    expect(names()).toBe('Bass Pad Kick Return A')
    useProjectStore.getState().undo()
    expect(outline()).toBe('Bass\n[Group 1\n  Lead\nPad\nKick\nReturn A')
  })
})
