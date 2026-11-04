import { openMasterEffects } from '../navigation'
import { showAutomation } from './control'
import { saveEffectsAction } from './library-save'
import { effectsPinAction } from './pin'
import type { Action, SubjectOf } from './types'

/** The master bus: nothing to rename, duplicate or delete; its effects save to the library. */
export const masterActions: readonly Action<SubjectOf<'master'>>[] = [
  { id: 'master.open-effects', title: 'Open effects', group: 'open', run: () => openMasterEffects() },
  effectsPinAction<SubjectOf<'master'>>('master.pin', () => ({ owner: { kind: 'master' }, graph: 'fx' })),
  {
    id: 'master.show-automation',
    title: 'Show automation',
    group: 'open',
    run: () => showAutomation({ kind: 'mixer', owner: { kind: 'master' }, control: 'volume' }),
  },
  saveEffectsAction<SubjectOf<'master'>>('master.save-effects-to-library', () => ({ kind: 'master' })),
]
