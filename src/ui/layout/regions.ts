import { REGION_NAMES, type RegionId } from '@state'

/** The regions that can be hidden, with the names their toggles and the status bar's menu use. */
export const TOGGLED_REGIONS: readonly { readonly id: RegionId; readonly name: string; readonly glyph: string }[] = [
  { id: 'primary', name: REGION_NAMES.primary, glyph: '◧' },
  { id: 'panel', name: REGION_NAMES.panel, glyph: '⬓' },
  { id: 'secondary', name: REGION_NAMES.secondary, glyph: '◨' },
]
