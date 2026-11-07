import { exampleProjects } from '@core'
import { type CommandContext, DEFAULT_LAYOUT, useLayoutStore, usePersistenceStore } from '@state'
import { afterEach, describe, expect, it } from 'vitest'
import type { LayoutPersistence } from '../layout/use-layout-persistence'
import type { MenuAction, MenuEntry, MenuSubmenu } from '../shared/menu'
import { attachLayoutNames } from './layout-names'
import { menuEntriesOf, SEPARATOR } from './menu-entries'
import { FILE_MENU, LAYOUT_MENU, VIEW_MENU } from './menus'

const idle = <T extends object>() => new Proxy({}, { get: () => () => undefined }) as T
const context: CommandContext = { engine: idle(), samples: idle(), library: idle(), files: idle(), origin: null, focus: [] }
const labels = (entries: readonly MenuEntry[]) => entries.map((entry) => (entry.kind === 'separator' ? '—' : entry.label))
const keys = (command: string) => (command === 'layout.toggle.panel' ? '⌃⌘J' : undefined)

/** Persistence with these named layouts. */
const withNames = (names: string[]) =>
  attachLayoutNames({ names: () => names, deleteNamed: (name: string) => names.splice(names.indexOf(name), 1) } as unknown as LayoutPersistence)

let detach: (() => void) | undefined
afterEach(() => {
  detach?.()
  useLayoutStore.setState(DEFAULT_LAYOUT)
  usePersistenceStore.setState({ hasBackup: false })
})

describe('menus from commands', () => {
  it('build File in order, with the examples as a submenu and Restore previous disabled without a backup', () => {
    const entries = menuEntriesOf(FILE_MENU, context, keys)
    expect(labels(entries)).toEqual(['Export to file…', 'Export audio (WAV)…', 'Import from file…', '—', 'New project', '—', 'Open example', '—', 'Restore previous'])
    const examples = entries[6] as MenuSubmenu
    expect(labels(examples.entries)).toEqual([...exampleProjects.map((example) => example.title), 'Starter'])
    expect((examples.entries[0] as MenuAction).tooltip).toBe(exampleProjects[0]!.tagline)
    expect((entries[8] as MenuAction).disabled).toBe(true)
    expect((entries[1] as MenuAction).takesFocus).toBe(true)
  })

  it('label the region toggles by what they will do, with their keys', () => {
    const entries = menuEntriesOf(LAYOUT_MENU, context, keys)
    expect(labels(entries).slice(0, 3)).toEqual(['Show primary sidebar', 'Hide panel', 'Show secondary sidebar'])
    expect((entries[1] as MenuAction).shortcut).toBe('⌃⌘J')
  })

  it('list the named layouts inline and to delete, and leave no separator at an end or twice', () => {
    const PRESETS = ['Compose', 'Arrange', 'Sound design', 'Mix']
    expect(labels(menuEntriesOf(LAYOUT_MENU, context, keys)).slice(3)).toEqual(['—', ...PRESETS, '—', 'Save layout as…', '—', 'Reset layout'])
    detach = withNames(['Mixing', 'Writing'])
    const entries = menuEntriesOf(LAYOUT_MENU, context, keys)
    expect(labels(entries).slice(3)).toEqual(['—', ...PRESETS, '—', 'Mixing', 'Writing', 'Save layout as…', 'Delete…', '—', 'Reset layout'])
    const remove = entries[12] as MenuSubmenu
    expect(remove.entries.every((entry) => entry.kind !== 'separator' && entry.kind !== 'submenu' && entry.danger)).toBe(true)
    expect(menuEntriesOf([SEPARATOR, 'layout.load', SEPARATOR, SEPARATOR, 'layout.reset', SEPARATOR], context, keys).map((entry) => entry.kind ?? 'action'))
      .toEqual(['submenu', 'separator', 'action'])
  })

  it('build View: the palette, every view under Show, the regions, maximize, the layouts and the theme', () => {
    const entries = menuEntriesOf(VIEW_MENU, context, keys)
    expect(labels(entries)).toEqual([
      'Show all commands', 'Keyboard shortcuts', '—', 'Show', '—', 'Show primary sidebar', 'Hide panel', 'Show secondary sidebar', 'Maximize or restore group', '—', 'Layouts', '—', 'Theme',
    ])
    expect(labels((entries.at(-1) as MenuSubmenu).entries)).toEqual(['Dark', 'Light', 'High contrast'])
    expect(labels((entries[3] as MenuSubmenu).entries)).toContain('Mixer')
    expect((entries[3] as MenuSubmenu).entries).toHaveLength(13)
  })
})
