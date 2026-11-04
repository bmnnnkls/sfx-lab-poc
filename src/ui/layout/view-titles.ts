import type { ViewId } from '@state'

/**
 * Every view's tab label, also the accessible name tests use. Keep `ViewTitle` in tests/browser/fixtures.ts in sync.
 * Imports no components, so a view can take another view's title for a label without an import cycle, and the
 * layout can name its tabs without loading the views.
 */
export const viewTitles: Readonly<Record<ViewId, string>> = {
  session: 'Session',
  arrangement: 'Arrangement',
  wave: 'Wave editor',
  instrument: 'Instrument',
  effects: 'Effects',
  notes: 'Notes',
  clip: 'Clip',
  mixer: 'Mixer',
  samples: 'Samples',
  sounds: 'Sounds',
  library: 'Library',
  tracks: 'Tracks',
  pinned: 'Pinned',
}

/**
 * The tooltips of the tabs that have one. Session's and Arrangement's name their key, which can change, so the
 * workbench draws them (`MAIN_VIEW_TOOLTIPS`).
 */
export const viewTooltips: Readonly<Partial<Record<ViewId, string>>> = {
  wave: 'Wave editor: normalize, reverse, trim and fade a sample',
  effects: "Effects: process the track's sound after the instrument (or the samples) and before the fader",
  notes: 'MIDI effects: change the notes before they reach the instrument',
  mixer: 'Mixer: a channel strip for every track, the returns and the master',
  tracks: 'Tracks: group, order, hide and show the tracks',
  pinned: 'Pinned: track panels to play while you work elsewhere',
}

/** Session's and Arrangement's tab tooltips, before the key that switches them. */
export const MAIN_VIEW_TOOLTIPS: Readonly<Partial<Record<ViewId, string>>> = {
  session: 'Session view',
  arrangement: 'Arrangement view',
}

export interface ViewMinSize {
  readonly width: number
  readonly height: number
}

const TOOL_VIEW: ViewMinSize = { width: 280, height: 200 }
const EDITOR: ViewMinSize = { width: 480, height: 240 }

/**
 * The least each view is laid out at. The shell never takes a view below it (a sash, the keyboard or a drop stops
 * there), and below it the view scrolls rather than reflowing further. Tool views fit a sidebar; editors need room.
 */
export const viewMinSizes: Readonly<Record<ViewId, ViewMinSize>> = {
  session: EDITOR,
  arrangement: EDITOR,
  wave: EDITOR,
  instrument: EDITOR,
  effects: EDITOR,
  notes: EDITOR,
  clip: EDITOR,
  mixer: TOOL_VIEW,
  samples: TOOL_VIEW,
  sounds: TOOL_VIEW,
  library: TOOL_VIEW,
  tracks: TOOL_VIEW,
  pinned: TOOL_VIEW,
}
