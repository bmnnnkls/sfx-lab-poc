import { AudioHost } from '@audio'
import type { EngineControls, ProjectFiles } from '@state'
import { ProjectStorage, resolveBrowserStore } from '@storage'
import { createEngineControls } from './engine-controls'
import { createProjectFiles } from './project-files'
import { restoreSavedProject } from './restore-project'

export interface Services {
  readonly host: AudioHost
  readonly storage: ProjectStorage
  readonly persistent: boolean
  readonly engineControls: EngineControls
  readonly projectFiles: ProjectFiles
}

/** Builds every long-lived object once, and restores the saved project before anything renders. */
export const createServices = (): Services => {
  const { store, persistent } = resolveBrowserStore()
  const storage = new ProjectStorage(store)
  restoreSavedProject(storage)

  const host = new AudioHost()
  const engineControls = createEngineControls(host)
  const projectFiles = createProjectFiles(storage, engineControls)
  return { host, storage, persistent, engineControls, projectFiles }
}
