import type { ViewId } from '@state'

/**
 * Every view's tab label, also the accessible name tests use. Keep `ViewTitle` in tests/browser/fixtures.ts in sync.
 * Imports no components, so a view can take another view's title for a label without an import cycle, and the
 * layout can name its tabs without loading the views.
 */
export const viewTitles: Readonly<Record<ViewId, string>> = {
  session: 'Session',
  arrangement: 'Arrangement',
  instrument: 'Instrument',
  effects: 'Effects',
  notes: 'Notes',
  clip: 'Clip',
  mixer: 'Mixer',
  samples: 'Samples',
  sounds: 'Sounds',
  library: 'Library',
}

/** The tooltips of the tabs that have one. */
export const viewTooltips: Readonly<Partial<Record<ViewId, string>>> = {
  session: 'Session view (Tab)',
  arrangement: 'Arrangement view (Tab)',
  effects: "Effects: process the track's sound after the instrument (or the samples) and before the fader",
  notes: 'MIDI effects: change the notes before they reach the instrument',
  mixer: 'Mixer: a channel strip for every track, the returns and the master',
}
