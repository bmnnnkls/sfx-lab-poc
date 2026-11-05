import type { AudioHost } from '@audio'
import { controlTargetKey, compileAutomation, diffProject, projectWithControlValues, resolveControlTarget } from '@core'
import { useControlStore, useProjectStore, useRecordSettings, useStatusStore, setTouchClock, reconcileTouches, cancelTouches, setRecordClock, reconcileRecords, cancelRecords } from '@state'

/** Keeps the engine mirroring the project document and feeds engine status back to the UI. */
export const connectEngine = (host: AudioHost): (() => void) => {
  setTouchClock(host.recordingBeat ? (agoMs) => host.recordingBeat(agoMs) : undefined)
  setRecordClock(host.recordingPosition ? (agoMs) => host.recordingPosition(agoMs) : undefined, host.outputLatency ? () => host.outputLatency() : undefined)
  // The click is a browser preference, not part of the project: sent apart from the diff, so a bounce never has it.
  const metronome = ({ metronome: on, metronomeLevel: level }: ReturnType<typeof useRecordSettings.getState>) => host.send({ type: 'transport/metronome', on, level })
  metronome(useRecordSettings.getState())
  const stopMetronome = useRecordSettings.subscribe((state, previous) => {
    if (state.metronome !== previous.metronome || state.metronomeLevel !== previous.metronomeLevel) metronome(state)
  })
  const sendDiff = (prev: Parameters<typeof diffProject>[0], next: Parameters<typeof diffProject>[1]) => {
    for (const command of diffProject(prev, next, false)) host.send(command)
  }

  let projection = projectWithControlValues(useProjectStore.getState().project, useControlStore.getState().overrides)
  sendDiff(null, projection)
  let automationProject = useProjectStore.getState().project
  let automationConfig = JSON.stringify(compileAutomation(automationProject))
  host.send({ type: 'automation/configure', tracks: compileAutomation(useProjectStore.getState().project) })
  const refresh = () => {
    const next = projectWithControlValues(useProjectStore.getState().project, useControlStore.getState().overrides)
    sendDiff(projection, next)
    projection = next
    if (automationProject === useProjectStore.getState().project) return
    automationProject = useProjectStore.getState().project
    const config = compileAutomation(automationProject)
    const signature = JSON.stringify(config)
    if (signature !== automationConfig) { automationConfig = signature; host.send({ type: 'automation/configure', tracks: config }) }
  }
  let overrideRevision = 0
  let lastOverrides = useControlStore.getState().overrides
  const stopControls = useControlStore.subscribe((state) => {
    if (state.overrides === lastOverrides) return
    lastOverrides = state.overrides
    refresh()
    host.send({ type: 'automation/overrides', values: state.overrides, revision: ++overrideRevision })
  })
  const stopProject = useProjectStore.subscribe((state, previous) => {
    if (state.project === previous.project && state.documentEpoch === previous.documentEpoch) return
    // A replacement/reset ends live ownership; ordinary edits retain only compatible overrides.
    if (state.documentEpoch !== previous.documentEpoch) { cancelTouches(); host.send({ type: 'notes/panic' }); host.send({ type: 'transport/stop' }); useControlStore.setState({ playback: [] }) }
    const overrides = useControlStore.getState().overrides
    const retained = state.documentEpoch !== previous.documentEpoch
      ? [] : overrides.filter((entry) => {
        const result = resolveControlTarget(state.project, entry.target)
        return result.status === 'available' && result.automatable
      })
    if (retained.length !== overrides.length) useControlStore.setState({ overrides: retained })
    else refresh()
  })
  const stopStatus = host.onStatus((status) => {
    reconcileTouches(status)
    reconcileRecords(status)
    useStatusStore.getState().setStatus(status)
    useControlStore.setState({ playback: status.automation ?? [] })
    if (status.automationOverrideRevision === overrideRevision && status.automationOverrides) {
      const retained = useControlStore.getState().overrides.filter((entry) => status.automationOverrides!.some((live) => controlTargetKey(live.target) === controlTargetKey(entry.target)))
      if (retained.length !== useControlStore.getState().overrides.length) useControlStore.setState({ overrides: retained })
    }
  })
  const stopFailure = host.onFailure(() => {
    useStatusStore.getState().setAudioFailure('Audio failed to start—reload to retry')
  })

  return () => {
    cancelTouches(); setTouchClock()
    cancelRecords(); setRecordClock()
    stopMetronome()
    host.send({ type: 'notes/panic' })
    stopProject()
    stopControls()
    stopStatus()
    stopFailure()
    useControlStore.setState({ playback: [] })
  }
}
