import { type Project, createDemoProject, createEmptyProject } from '@core'
import { type ProjectStorage, type SampleStorage, downloadFile, exportProject, importProject, pickFile } from '@storage'
import {
  type EngineControls,
  type ProjectFiles,
  usePersistenceStore,
  useProjectStore,
  useSelectionStore,
} from '@state'

const PICKER_ACCEPT = '.json,.sfxlab,application/json,application/zip'

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/** Replace/restore flows share one path so the backup, engine and selection are always handled. */
export const createProjectFiles = (
  storage: ProjectStorage,
  sampleStorage: SampleStorage,
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
    exportProject: async () => {
      try {
        const project = useProjectStore.getState().project
        const file = await exportProject(project, (id) => sampleStorage.get(id))
        downloadFile(file.fileName, file.mimeType, file.bytes)
        if (file.missing.length > 0) {
          persistence().notify(
            'warning',
            `Exported without ${file.missing.length} sample(s) whose audio is missing`,
            file.missing.map((sample) => sample.name),
          )
        }
      } catch (error) {
        persistence().notify('error', `Export failed: ${describe(error)}`)
      }
    },

    importProject: async () => {
      const bytes = await pickFile(PICKER_ACCEPT)
      if (bytes === null) return

      const result = await importProject(bytes)
      if (!result.ok) {
        persistence().notify('error', `Import failed: ${result.error}`)
        return
      }

      try {
        for (const [id, audio] of result.samples) {
          if (!(await sampleStorage.has(id))) await sampleStorage.put(id, audio)
        }
        // A plain .json has no audio: flag samples this browser doesn't have so the user knows why they're silent.
        const warnings = [...result.warnings]
        for (const sample of result.project.samples) {
          if (!result.samples.has(sample.id) && !(await sampleStorage.has(sample.id))) {
            warnings.push(`No audio for sample "${sample.name}": import the original file to restore it`)
          }
        }
        const note = warnings.length > 0 ? ' (with notes)' : ''
        apply(result.project, `Imported "${result.project.name}"${note}`, warnings)
      } catch (error) {
        persistence().notify('error', `Import failed: ${describe(error)}`)
      }
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
