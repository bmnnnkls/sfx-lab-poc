import { createDeferredPersonalLibrary } from './library-service'
import { createLibraryStorage, createMemoryLibraryStorage, createMemorySampleStorage } from '@storage'
import { createMidiInput } from './midi-input'
import { AudioHost, createSpectrumService } from '@audio'
import type { EngineControls, ProjectFiles } from '@state'
import { ProjectStorage, createMemorySampleEditLog, resolveBrowserStore, resolveSampleEditLog, resolveSampleStorage } from '@storage'
import { createEngineControls } from './engine-controls'
import { createProjectFiles } from './project-files'
import { restoreSavedProject } from './restore-project'
import { scheduleSampleCleanup } from './sample-cleanup'
import { type SampleLibraryService, createSampleLibrary } from './sample-library'
import { type WaveSpectra, createWaveSpectra } from './wave-spectrum'
import { useProjectStore } from '@state'

export interface Services {
  readonly library: ReturnType<typeof createDeferredPersonalLibrary>
  readonly midi: ReturnType<typeof createMidiInput>
  readonly host: AudioHost
  readonly storage: ProjectStorage
  readonly persistent: boolean
  readonly engineControls: EngineControls
  readonly projectFiles: ProjectFiles
  readonly sampleLibrary: SampleLibraryService
  /** The spectra of the samples the Wave editor shows, while its lanes show the spectrogram. */
  readonly waveSpectra: WaveSpectra
  /** Schedules the cleanup of files edits wrote that nothing names any more, once; returns a cancel. */
  readonly cleanUpSamples: () => () => void
}

/** Builds every long-lived object once, and restores the saved project before anything renders. */
export const createServices = (): Services => {
  const { store, persistent } = resolveBrowserStore()
  const storage = new ProjectStorage(store)
  restoreSavedProject(storage)

  const host = new AudioHost()
  const engineControls = createEngineControls(host)
  const memoryBlobs = new Map<string, Uint8Array>()
  const sampleStorage = typeof indexedDB === 'undefined' ? createMemorySampleStorage(memoryBlobs) : resolveSampleStorage()
  const libraryStorage = typeof indexedDB === 'undefined' ? createMemoryLibraryStorage(memoryBlobs) : createLibraryStorage()
  const library = createDeferredPersonalLibrary(libraryStorage, sampleStorage)
  const sampleEdits = typeof indexedDB === 'undefined' ? createMemorySampleEditLog() : resolveSampleEditLog()
  // One spectrum worker: the spectrogram's columns and the band edits.
  const spectrum = createSpectrumService()
  const sampleLibrary = createSampleLibrary(sampleStorage, host, { edits: sampleEdits, spectrum })
  const waveSpectra = createWaveSpectra(spectrum)
  const projectFiles = createProjectFiles(storage, sampleStorage, engineControls)
  const midi = createMidiInput(engineControls, undefined, () => { void host.start() })
  const cleanUpSamples = () =>
    scheduleSampleCleanup({
      samples: sampleStorage,
      edits: sampleEdits,
      slots: () => storage.slotTexts(),
      catalog: async () => (await libraryStorage.read()).samples,
      history: () => useProjectStore.getState().history,
      now: Date.now,
    })
  return { cleanUpSamples, library, host, waveSpectra, storage, persistent, engineControls: { ...engineControls, stop: () => { midi.releaseNotes(); engineControls.stop() }, panic: midi.panic }, projectFiles, sampleLibrary, midi }
}
