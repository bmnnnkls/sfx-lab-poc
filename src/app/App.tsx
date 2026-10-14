import { EngineControlsProvider, ProjectFilesProvider, SampleLibraryProvider } from '@state'
import { Workspace } from '@ui'
import { useEffect } from 'react'
import { startAutosave } from './autosave'
import { connectMidi } from './midi'
import { connectEngine } from './project-sync'
import type { Services } from './services'

/** Composition root: wires state, engine, storage and UI together. */
export const App = ({ services }: { services: Services }) => {
  const { host, storage, persistent, engineControls, projectFiles, sampleLibrary, midiInput } = services

  useEffect(() => connectEngine(host), [host])
  useEffect(() => startAutosave(storage, persistent), [storage, persistent])
  useEffect(() => sampleLibrary.connect(), [sampleLibrary])
  useEffect(() => connectMidi(midiInput, engineControls), [midiInput, engineControls])

  return (
    <EngineControlsProvider value={engineControls}>
      <ProjectFilesProvider value={projectFiles}>
        <SampleLibraryProvider value={sampleLibrary}>
          <Workspace />
        </SampleLibraryProvider>
      </ProjectFilesProvider>
    </EngineControlsProvider>
  )
}
