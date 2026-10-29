import { type InstrumentTrack, exampleProjects } from '@core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Subject } from '../actions'
import { fakeContext, loadDemo } from '../actions/test-support'
import { DEFAULT_LAYOUT, type LayoutDriver, type ViewId, useLayoutStore } from '../layout-store'
import { usePersistenceStore } from '../persistence-store'
import type { ProjectFiles } from '../project-files'
import { useProjectStore } from '../project-store'
import { useSelectionStore } from '../selection-store'
import { useStatusStore } from '../status-store'
import { useTouchStore } from '../touch-store'
import { type Command, type CommandContext, canRunCommand, runCommand, selectionSubjects, STATE_COMMANDS, viewCommands } from '.'

const TITLES: Record<ViewId, string> = {
  session: 'Session', arrangement: 'Arrangement', wave: 'Wave editor', instrument: 'Instrument', effects: 'Effects', notes: 'Notes',
  clip: 'Clip', mixer: 'Mixer', samples: 'Samples', sounds: 'Sounds', library: 'Library', tracks: 'Tracks', pinned: 'Pinned',
}
const COMMANDS = [...STATE_COMMANDS, ...viewCommands(TITLES)]
const command = (id: string): Command => COMMANDS.find((candidate) => candidate.id === id)!

const project = () => useProjectStore.getState().project
const track = (name: string) => project().tracks.find((candidate) => candidate.name === name) as InstrumentTrack

/** A context whose services and files record each call in `calls`. */
const contextOf = (overrides: Partial<CommandContext> = {}): CommandContext & { calls: string[] } => {
  const base = fakeContext()
  const files = new Proxy({}, { get: (_target, method) => (...args: unknown[]) => { base.calls.push(`files.${String(method)}(${args.map((arg) => JSON.stringify(arg)).join(', ')})`) } }) as ProjectFiles
  return Object.assign(base, { files, focus: [], ...overrides })
}

let detach: (() => void) | undefined
beforeEach(() => {
  loadDemo()
  useSelectionStore.getState().reset()
})
afterEach(() => {
  detach?.()
  detach = undefined
  useLayoutStore.setState(DEFAULT_LAYOUT)
  useStatusStore.setState({ status: null })
  usePersistenceStore.setState({ hasBackup: false })
  useTouchStore.setState({ armed: false })
})

describe('state commands', () => {
  it('have unique ids, and a view command per view', () => {
    expect(new Set(COMMANDS.map((candidate) => candidate.id)).size).toBe(COMMANDS.length)
    expect(viewCommands(TITLES).map((candidate) => candidate.title)).toContain('Show Pinned')
    runCommand(command('view.show.mixer'), contextOf())
    expect(useLayoutStore.getState().visible).toContain('mixer')
  })

  it("name a region toggle by what it will do: Hide panel, Show primary sidebar", () => {
    expect(command('layout.toggle.panel').title).toBe('Toggle panel')
    expect(command('layout.toggle.panel').label!(contextOf())).toBe('Hide panel')
    expect(command('layout.toggle.primary').label!(contextOf())).toBe('Show primary sidebar')
    runCommand(command('layout.toggle.panel'), contextOf())
    expect(command('layout.toggle.panel').label!(contextOf())).toBe('Show panel')
  })

  it('maximize the focused view’s group through the driver', () => {
    const driver: LayoutDriver = { reveal: vi.fn(), setRegionVisible: vi.fn(), toggleMaximize: vi.fn(), reset: vi.fn(), load: vi.fn(), loadPreset: vi.fn(), saveAs: vi.fn() }
    detach = useLayoutStore.getState().attachDriver(driver)
    runCommand(command('layout.maximize'), contextOf({ origin: 'mixer' }))
    expect(driver.toggleMaximize).toHaveBeenLastCalledWith('mixer')
    runCommand(command('layout.maximize'), contextOf())
    expect(driver.toggleMaximize).toHaveBeenLastCalledWith(undefined)
  })

  it('enable Restore previous only with a backup', () => {
    const context = contextOf()
    expect(canRunCommand(command('file.restore-previous'), context)).toBe(false)
    runCommand(command('file.restore-previous'), context)
    expect(context.calls).toEqual([])
    usePersistenceStore.setState({ hasBackup: true })
    runCommand(command('file.restore-previous'), context)
    expect(context.calls).toEqual(['files.restorePrevious()'])
  })

  it('open an example or the starter, chosen by id, with the tagline as tooltip', () => {
    const context = contextOf()
    const choices = command('file.open-example').choices!(context)
    expect(choices.map((choice) => choice.title)).toEqual([...exampleProjects.map((example) => example.title), 'Starter'])
    expect(choices[0]!.tooltip).toBe(exampleProjects[0]!.tagline)
    runCommand(command('file.open-example'), context, exampleProjects[0]!.id)
    runCommand(command('file.open-example'), context, 'starter')
    runCommand(command('file.open-example'), context, 'nothing')
    expect(context.calls).toEqual([`files.loadExample("${exampleProjects[0]!.id}")`, 'files.loadDemo()'])
  })

  it('play or stop by what the engine reports', () => {
    const context = contextOf()
    runCommand(command('transport.play-stop'), context)
    useStatusStore.setState({ status: { playing: true } as never })
    runCommand(command('transport.play-stop'), context)
    expect(context.calls).toEqual(['engine.play()', 'engine.stop()'])
  })

  it('arm and disarm Touch, labelled by what it will do', () => {
    const touch = command('transport.touch')
    expect(touch.label!(contextOf())).toBe('Arm Touch automation')
    runCommand(touch, contextOf())
    expect(useTouchStore.getState().armed).toBe(true)
    expect(touch.label!(contextOf())).toBe('Disarm Touch automation')
  })

  it('enable undo and redo with something to undo or redo', () => {
    expect(canRunCommand(command('history.undo'), contextOf())).toBe(false)
    const count = project().tracks.length
    runCommand(command('track.add-return'), contextOf())
    expect(project().tracks.at(-1)?.kind).toBe('return')
    expect(canRunCommand(command('history.undo'), contextOf())).toBe(true)
    runCommand(command('history.undo'), contextOf())
    expect(canRunCommand(command('history.redo'), contextOf())).toBe(true)
    expect(project().tracks).toHaveLength(count)
  })

  it('apply an edit key only when the focused thing has an action for it, and stay out of the palette', () => {
    const bass = track('Bass')
    const clip: Subject = { kind: 'clip', trackId: bass.id, clipId: bass.clips[0]!.id }
    expect(STATE_COMMANDS.filter((candidate) => candidate.palette === false).map((candidate) => candidate.id)).toEqual(
      ['edit.delete', 'edit.duplicate', 'edit.copy', 'edit.cut', 'edit.paste', 'edit.rename'],
    )
    expect(canRunCommand(command('edit.delete'), contextOf())).toBe(false)
    expect(canRunCommand(command('edit.paste'), contextOf({ focus: [clip] }))).toBe(false)
    runCommand(command('edit.delete'), contextOf({ focus: [clip] }))
    expect(track('Bass').clips[0]).toBeNull()
  })

  it('report what an asynchronous command throws', async () => {
    const report = vi.fn()
    await runCommand({ id: 'x', category: 'Help', title: 'X', run: async () => { throw new Error('No') } }, contextOf(), undefined, report)
    expect(report).toHaveBeenCalledWith('error', 'No')
  })
})

describe('selectionSubjects', () => {
  it('give the region over the clip over the track, and the sample beside it', () => {
    const bass = track('Bass')
    const select = useSelectionStore.getState()
    expect(selectionSubjects()).toEqual([])
    select.selectTrack(bass.id)
    expect(selectionSubjects()).toEqual([{ kind: 'track', trackId: bass.id }])
    select.selectClip(bass.id, bass.clips[0]!.id)
    select.selectSample('kick')
    expect(selectionSubjects()).toEqual([{ kind: 'clip', trackId: bass.id, clipId: bass.clips[0]!.id }, { kind: 'sample', sampleId: 'kick' }])
    useProjectStore.getState().addArrangementClip(bass.id, 0, bass.clips[0]!)
    const regionId = project().arrangement![0]!.id
    select.selectRegion(regionId, bass.id)
    expect(selectionSubjects()[0]).toEqual({ kind: 'region', regionId })
    select.selectMaster()
    expect(selectionSubjects()[0]).toEqual({ kind: 'master' })
  })

  it('skip a selected clip or region that is gone, for its track', () => {
    const bass = track('Bass')
    useSelectionStore.getState().selectClip(bass.id, bass.clips[0]!.id)
    useProjectStore.getState().deleteClip(bass.id, 0)
    expect(selectionSubjects()).toEqual([{ kind: 'track', trackId: bass.id }])
    useProjectStore.getState().addArrangementClip(bass.id, 0, bass.clips[1]!)
    const regionId = project().arrangement![0]!.id
    useSelectionStore.getState().selectRegion(regionId, bass.id)
    useProjectStore.getState().removeArrangementClip(regionId)
    expect(selectionSubjects()).toEqual([{ kind: 'track', trackId: bass.id }])
  })
})
