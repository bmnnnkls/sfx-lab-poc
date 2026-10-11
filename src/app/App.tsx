import { AudioHost } from '@audio'
import { EngineControlsProvider } from '@state'
import { Workspace } from '@ui'
import { useEffect, useMemo } from 'react'
import { createEngineControls } from './engine-controls'
import { connectEngine } from './project-sync'

/** Composition root: creates the audio host once and wires state, engine and UI together. */
export const App = () => {
  const host = useMemo(() => new AudioHost(), [])
  const controls = useMemo(() => createEngineControls(host), [host])

  useEffect(() => connectEngine(host), [host])

  return (
    <EngineControlsProvider value={controls}>
      <Workspace />
    </EngineControlsProvider>
  )
}
