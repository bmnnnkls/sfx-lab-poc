import { type Project, createDemoProject, createEmptyProject, parseProject } from '@core'
import { type ProjectStorage, downloadProjectFile, pickProjectFile } from '@storage'
import {
  type EngineControls,
  type ProjectFiles,
  usePersistenceStore,
  useProjectStore,
  useSelectionStore,
} from '@state'

/** Replace/restore flows share one path so the backup, engine and selection are always handled. */
export const createProjectFiles = (
  storage: ProjectStorage,
  engine: EngineControls,
): ProjectFiles => {
  const persistence = () => usePersistenceStore.getState()

  const apply = (next: Project, message: string, details: readonly string[] = []) => {
    const previous = useProjectStore.getState().project
    storage.saveBackup(previous)

    engine.stop()
    useSelectionStore.getState().reset()
    useProjectStore.getState().replaceProject(next)

    persistence().setHasBackup(storage.hasBackup())
    persistence().notify(details.length > 0 ? 'warning' : 'info', message, details)
  }

  return {
    exportProject: () => downloadProjectFile(useProjectStore.getState().project),

    importProject: async () => {
      const text = await pickProjectFile()
      if (text === null) return

      const result = parseProject(text)
      if (!result.ok) {
        persistence().notify('error', `Import failed: ${result.error}`)
        return
      }
      const note = result.warnings.length > 0 ? ' (with repairs)' : ''
      apply(result.project, `Imported "${result.project.name}"${note}`, result.warnings)
    },

    newProject: () => apply(createEmptyProject(), 'Started a new project'),

    loadDemo: () => apply(createDemoProject(), 'Loaded the demo project'),

    restorePrevious: () => {
      const outcome = storage.loadBackup()
      if (outcome.status !== 'loaded') {
        persistence().notify('error', 'There is no previous project to restore.')
        return
      }
      apply(outcome.project, `Restored "${outcome.project.name}"`, outcome.warnings)
    },
  }
}
