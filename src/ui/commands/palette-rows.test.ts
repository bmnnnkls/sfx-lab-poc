import { createDemoProject, exampleProjects } from '@core'
import { type CommandContext, describeActions, type Subject, useProjectStore, usePersistenceStore } from '@state'
import { beforeEach, describe, expect, it } from 'vitest'
import { commandRows, subjectRows } from './palette-rows'
import { COMMANDS } from './registry'

/** A context whose services do nothing. */
const contextOf = (focus: readonly Subject[] = []): CommandContext => {
  const idle = <T extends object>() => new Proxy({}, { get: () => () => undefined }) as T
  return { engine: idle(), samples: idle(), library: idle(), files: idle(), origin: null, focus }
}
/** The commands that don't read the DOM to know whether they apply (F6's do). */
const PURE = COMMANDS.filter((command) => !command.id.startsWith('layout.focus-'))
const track = (name: string) => useProjectStore.getState().project.tracks.find((candidate) => candidate.name === name)!

beforeEach(() => {
  useProjectStore.getState().resetProject(createDemoProject())
  usePersistenceStore.setState({ hasBackup: false })
})

describe('subject rows', () => {
  it("are exactly describeActions for each subject: ids, titles, enabled and choices", () => {
    const bass: Subject = { kind: 'track', trackId: track('Bass').id }
    const scene: Subject = { kind: 'scene', scene: 0 }
    for (const subject of [bass, scene, { kind: 'master' } as Subject]) {
      const context = contextOf([subject])
      const rows = subjectRows([subject], [], context)
      const expected = describeActions(subject, context).flatMap((item): { action: string; choice: string | undefined; title: string; enabled: boolean }[] =>
        item.choices
          ? item.choices.map((choice) => ({ action: item.id, choice: choice.id, title: item.inline ? choice.title : `${item.title}: ${choice.title}`, enabled: item.enabled && choice.enabled !== false }))
          : [{ action: item.id, choice: undefined, title: item.title, enabled: item.enabled }])
      expect(rows.map((row) => ({
        action: row.target.kind === 'action' ? row.target.action : '',
        choice: row.target.kind === 'action' ? row.target.choice : '',
        title: row.label.slice(row.label.indexOf(': ') + 2),
        enabled: row.enabled,
      }))).toEqual(expected)
    }
  })

  it('name each row by its subject, focus first, then the selection without repeats', () => {
    const bass: Subject = { kind: 'track', trackId: track('Bass').id }
    const lead: Subject = { kind: 'track', trackId: track('Lead').id }
    const rows = subjectRows([bass], [{ ...bass }, lead], contextOf([bass]))
    expect(rows.find((row) => row.label === 'Bass: Duplicate')).toBeDefined()
    expect(rows.filter((row) => row.label === 'Bass: Duplicate')).toHaveLength(1)
    expect(rows.find((row) => row.label === 'Lead: Duplicate')).toBeDefined()
    expect(rows.find((row) => row.label === 'Bass: Pin panel: Instrument')).toMatchObject({ target: { action: 'track.pin', choice: 'patch' } })
    expect(rows.find((row) => row.label === 'Bass: Rename')?.takesFocus).toBe(true)
  })
})

describe('command rows', () => {
  it('leave out the edit keys and what does not apply, and draw a disabled command dimmed', () => {
    const rows = commandRows(PURE, contextOf(), () => undefined)
    expect(rows.some((row) => row.label.startsWith('Edit: Delete'))).toBe(false)
    expect(rows.find((row) => row.label === 'View: Show Mixer')).toBeDefined()
    expect(rows.find((row) => row.label === 'Layout: Hide panel')).toBeDefined()
    expect(rows.find((row) => row.label === 'File: Restore previous')?.enabled).toBe(false)
  })

  it('give one row per choice, with its tooltip, and the key of a command', () => {
    const rows = commandRows(PURE, contextOf(), (id) => (id === 'history.undo' ? '⌘Z' : undefined))
    const example = rows.find((row) => row.label === `Open example: ${exampleProjects[0]!.title}`)
    expect(example).toMatchObject({ tooltip: exampleProjects[0]!.tagline, target: { command: 'file.open-example', choice: exampleProjects[0]!.id } })
    expect(rows.find((row) => row.label === 'Open example: Starter')).toBeDefined()
    expect(rows.find((row) => row.label === 'Edit: Undo')?.key).toBe('⌘Z')
  })
})
