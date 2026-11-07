import type { ViewId } from '@state'
import { LAYOUT_PRESETS } from '../layout/default-layout'
import { viewTitles } from '../layout/view-titles'
import { type CommandMenuItem, SEPARATOR } from './menu-entries'

/** File, in the transport bar. */
export const FILE_MENU: readonly CommandMenuItem[] = [
  'file.export',
  'file.export-audio',
  'file.import',
  SEPARATOR,
  'file.new',
  SEPARATOR,
  'file.open-example',
  SEPARATOR,
  'file.restore-previous',
]

const REGIONS: readonly CommandMenuItem[] = ['layout.toggle.primary', 'layout.toggle.panel', 'layout.toggle.secondary']

/** The layouts: the built-in ones, the named ones to load, save and delete, and the default. */
const LAYOUTS: readonly CommandMenuItem[] = [
  ...LAYOUT_PRESETS.map(({ id, title }) => ({ command: `layout.preset.${id}`, label: title })),
  SEPARATOR,
  { command: 'layout.load', inline: true },
  'layout.save-as',
  { command: 'layout.delete', label: 'Delete…' },
  SEPARATOR,
  'layout.reset',
]

/** The status bar's *Layout*: the route to the toggles when the panel's strip is off screen. */
export const LAYOUT_MENU: readonly CommandMenuItem[] = [...REGIONS, SEPARATOR, ...LAYOUTS]

/** View, after File: the palette, every view, the regions, the layouts and the theme. */
export const VIEW_MENU: readonly CommandMenuItem[] = [
  'palette.show',
  'help.shortcuts',
  SEPARATOR,
  { submenu: 'Show', items: (Object.keys(viewTitles) as ViewId[]).map((view) => ({ command: `view.show.${view}`, label: viewTitles[view] })) },
  SEPARATOR,
  ...REGIONS,
  'layout.maximize',
  SEPARATOR,
  { submenu: 'Layouts', items: LAYOUTS },
  SEPARATOR,
  'view.theme',
]

/** Library, after View: the saves of what is selected, then what *My library*'s own menu does, then the view. */
export const LIBRARY_MENU: readonly CommandMenuItem[] = [
  'library.save-instrument',
  'library.save-effects',
  'library.save-notes',
  'library.save-clip',
  'library.save-sample',
  SEPARATOR,
  'library.new-folder',
  'library.import',
  'library.export',
  SEPARATOR,
  'view.show.library',
]

/** ● Rec's ▾ in the transport bar: the record settings. */
export const RECORD_MENU: readonly CommandMenuItem[] = ['transport.fixed-length', 'transport.count-in', 'transport.metronome-level']
