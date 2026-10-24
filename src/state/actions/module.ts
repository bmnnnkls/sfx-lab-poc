import { moduleUsage } from '@core'
import { useGraphViewStore } from '../graph-view-store'
import { useProjectStore } from '../project-store'
import { project } from './lookup'
import { renameAction } from './rename'
import type { Action, SubjectOf } from './types'

type ModuleSubject = SubjectOf<'module'>

const uses = ({ moduleId }: ModuleSubject) => moduleUsage(project(), moduleId).uses

/** A module definition, from the bar over its inside. */
export const moduleActions: readonly Action<ModuleSubject>[] = [
  renameAction('module'),
  {
    id: 'module.toggle-interface',
    title: () => (useGraphViewStore.getState().moduleInterface ? 'Hide interface' : 'Show interface'),
    group: 'edit',
    run: () => useGraphViewStore.getState().toggleModuleInterface(),
  },
  {
    id: 'module.delete',
    // A module still in use can't go; the entry says why.
    title: (subject) => (uses(subject) > 0 ? 'Delete — remove or unlink every use first' : 'Delete'),
    group: 'delete',
    danger: true,
    enabled: (subject) => uses(subject) === 0,
    run: ({ moduleId }) => useProjectStore.getState().deleteModule(moduleId),
  },
]
