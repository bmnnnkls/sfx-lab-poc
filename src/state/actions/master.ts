import { openMasterEffects } from '../navigation'
import { showAutomation } from './control'
import type { Action, SubjectOf } from './types'

/** The master bus: nothing to rename, duplicate or delete. */
export const masterActions: readonly Action<SubjectOf<'master'>>[] = [
  { id: 'master.open-effects', title: 'Open effects', group: 'open', run: () => openMasterEffects() },
  {
    id: 'master.show-automation',
    title: 'Show automation',
    group: 'open',
    run: () => showAutomation({ kind: 'mixer', owner: { kind: 'master' }, control: 'volume' }),
  },
]
