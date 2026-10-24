import type { RegionId } from '@state'

/** The regions that can be hidden, with the names their toggles and the status bar's menu use. */
export const TOGGLED_REGIONS: readonly { readonly id: RegionId; readonly name: string; readonly glyph: string }[] = [
  { id: 'primary', name: 'Primary sidebar', glyph: '◧' },
  { id: 'panel', name: 'Panel', glyph: '⬓' },
  { id: 'secondary', name: 'Secondary sidebar', glyph: '◨' },
]
