import { type ProjectStorage, createAutosaver } from '@storage'
import { usePersistenceStore, useProjectStore } from '@state'

/** Saves the project whenever it changes (debounced) and when the tab is hidden or closed. */
export const startAutosave = (storage: ProjectStorage, persistent: boolean): (() => void) => {
  const { setSaveState } = usePersistenceStore.getState()
  if (!persistent) setSaveState('memory-only')

  const autosaver = createAutosaver({
    save: (project) => storage.saveCurrent(project),
    onStatus: (status, error) => setSaveState(persistent ? status : 'memory-only', error),
  })

  const stopProject = useProjectStore.subscribe((state, previous) => {
    if (state.project !== previous.project) autosaver.schedule(state.project)
  })
  const flushWhenHidden = () => {
    if (document.visibilityState === 'hidden') autosaver.flush()
  }
  document.addEventListener('visibilitychange', flushWhenHidden)
  window.addEventListener('pagehide', autosaver.flush)

  return () => {
    stopProject()
    document.removeEventListener('visibilitychange', flushWhenHidden)
    window.removeEventListener('pagehide', autosaver.flush)
    autosaver.dispose()
  }
}
