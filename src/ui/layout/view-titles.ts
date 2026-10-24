import type { ViewId } from '@state'

/**
 * Every view's tab label, also the accessible name tests use. Keep `ViewTitle` in tests/browser/fixtures.ts in sync.
 * Imports no components, so a view can take another view's title for a label without an import cycle.
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
