import { createDeferredPersonalLibrary } from './library-service'
import { createLibraryStorage, createMemoryLibraryStorage } from '@storage'
import { createMidiInput } from './midi-input'
import { AudioHost } from '@audio'
import type { EngineControls, ProjectFiles } from '@state'
import { ProjectStorage, resolveBrowserStore, resolveSampleStorage } from '@storage'
import { createEngineControls } from './engine-controls'
import { createProjectFiles } from './project-files'
import { restoreSavedProject } from './restore-project'
import { type SampleLibraryService, createSampleLibrary } from './sample-library'

export interface Services {
  readonly library: ReturnType<typeof createDeferredPersonalLibrary>
  readonly midi: ReturnType<typeof createMidiInput>
  readonly host: AudioHost
  readonly storage: ProjectStorage
  readonly persistent: boolean
  readonly engineControls: EngineControls
  readonly projectFiles: ProjectFiles
  readonly sampleLibrary: SampleLibraryService
}

/** Builds every long-lived object once, and restores the saved project before anything renders. */
export const createServices = (): Services => {
  const { store, persistent } = resolveBrowserStore()
  const storage = new ProjectStorage(store)
  restoreSavedProject(storage)

  const host = new AudioHost()
  const engineControls = createEngineControls(host)
  const sampleStorage = resolveSampleStorage()
  const library = createDeferredPersonalLibrary(typeof indexedDB === 'undefined' ? createMemoryLibraryStorage() : createLibraryStorage(), sampleStorage)
  const sampleLibrary = createSampleLibrary(sampleStorage, host)
  const projectFiles = createProjectFiles(storage, sampleStorage, engineControls)
  const midi = createMidiInput(engineControls, undefined, () => { void host.start() })
  return { library, host, storage, persistent, engineControls: { ...engineControls, stop: () => { midi.releaseNotes(); engineControls.stop() }, panic: midi.panic }, projectFiles, sampleLibrary, midi }
}
