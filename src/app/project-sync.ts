import type { AudioHost } from '@audio'
import { diffProject } from '@core'
import { useProjectStore, useStatusStore } from '@state'

/** Keeps the engine mirroring the project document and feeds engine status back to the UI. */
export const connectEngine = (host: AudioHost): (() => void) => {
  const sendDiff = (prev: Parameters<typeof diffProject>[0], next: Parameters<typeof diffProject>[1]) => {
    for (const command of diffProject(prev, next)) host.send(command)
  }

  sendDiff(null, useProjectStore.getState().project)
  const stopProject = useProjectStore.subscribe((state, previous) =>
    sendDiff(previous.project, state.project),
  )
  const stopStatus = host.onStatus((status) => useStatusStore.getState().setStatus(status))

  return () => {
    stopProject()
    stopStatus()
  }
}
