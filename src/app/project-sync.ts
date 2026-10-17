import type { AudioHost } from '@audio'
import { diffProject, projectWithControlValues, resolveControlTarget } from '@core'
import { useControlStore, useProjectStore, useStatusStore } from '@state'

/** Keeps the engine mirroring the project document and feeds engine status back to the UI. */
export const connectEngine = (host: AudioHost): (() => void) => {
  const sendDiff = (prev: Parameters<typeof diffProject>[0], next: Parameters<typeof diffProject>[1]) => {
    for (const command of diffProject(prev, next)) host.send(command)
  }

  let projection = projectWithControlValues(useProjectStore.getState().project, useControlStore.getState().overrides)
  sendDiff(null, projection)
  const refresh = () => {
    const next = projectWithControlValues(useProjectStore.getState().project, useControlStore.getState().overrides)
    sendDiff(projection, next)
    projection = next
  }
  const stopControls = useControlStore.subscribe(refresh)
  const stopProject = useProjectStore.subscribe((state, previous) => {
    if (state.project === previous.project && state.documentEpoch === previous.documentEpoch) return
    // A replacement/reset ends live ownership; ordinary edits retain only compatible overrides.
    if (state.documentEpoch !== previous.documentEpoch) host.send({ type: 'notes/panic' })
    const overrides = useControlStore.getState().overrides
    const retained = state.documentEpoch !== previous.documentEpoch
      ? [] : overrides.filter((entry) => {
        const result = resolveControlTarget(state.project, entry.target)
        return result.status === 'available' && result.automatable
      })
    if (retained.length !== overrides.length) useControlStore.setState({ overrides: retained })
    else refresh()
  })
  const stopStatus = host.onStatus((status) => useStatusStore.getState().setStatus(status))

  return () => {
    host.send({ type: 'notes/panic' })
    stopProject()
    stopControls()
    stopStatus()
  }
}
