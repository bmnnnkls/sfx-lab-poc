import { REGION_NAMES, type RegionId } from '@state'
import type { IconName } from '../shared/icon'

/** The regions that can be hidden, with the names their toggles and the status bar's menu use. */
export const TOGGLED_REGIONS: readonly { readonly id: RegionId; readonly name: string; readonly icon: IconName }[] = [
  { id: 'primary', name: REGION_NAMES.primary, icon: 'panel-left' },
  { id: 'panel', name: REGION_NAMES.panel, icon: 'panel-bottom' },
  { id: 'secondary', name: REGION_NAMES.secondary, icon: 'panel-right' },
]
