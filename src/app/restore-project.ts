import type { ProjectStorage } from '@storage'
import { usePersistenceStore, useProjectStore } from '@state'

/** Runs once at startup, before the first render: loads the autosaved project if there is one. */
export const restoreSavedProject = (storage: ProjectStorage): void => {
  const { notify, setHasBackup } = usePersistenceStore.getState()
  const outcome = storage.loadCurrent()

  if (outcome.status === 'loaded') {
    useProjectStore.getState().resetProject(outcome.project)
    if (outcome.warnings.length > 0) {
      notify('warning', 'Your saved project needed repairs', outcome.warnings)
    }
  } else if (outcome.status === 'corrupt') {
    notify(
      'error',
      `Your saved project could not be read (${outcome.error}). A copy was kept; starting with the demo project.`,
    )
  }
  setHasBackup(storage.hasBackup())
}
