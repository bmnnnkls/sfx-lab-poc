import { MidiProvider, EngineControlsProvider, ProjectFilesProvider, SampleLibraryProvider } from '@state'
import { Workspace } from '@ui'
import { useEffect } from 'react'
import { startAutosave } from './autosave'
import { connectEngine } from './project-sync'
import type { Services } from './services'

/** Composition root: wires state, engine, storage and UI together. */
export const App = ({ services }: { services: Services }) => {
  const { midi, host, storage, persistent, engineControls, projectFiles, sampleLibrary } = services

  useEffect(() => connectEngine(host), [host])
  useEffect(() => startAutosave(storage, persistent), [storage, persistent])
  useEffect(() => sampleLibrary.connect(), [sampleLibrary])
  useEffect(() => midi.connect(), [midi])

  return (
    <EngineControlsProvider value={engineControls}>
      <ProjectFilesProvider value={projectFiles}>
        <SampleLibraryProvider value={sampleLibrary}>
          <MidiProvider value={midi}><Workspace /></MidiProvider>
        </SampleLibraryProvider>
      </ProjectFilesProvider>
    </EngineControlsProvider>
  )
}
