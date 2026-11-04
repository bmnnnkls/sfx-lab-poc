import { useArrangementView } from './arrangement-view-store'
import type { EngineControls } from './engine-controls'
import { useStatusStore } from './status-store'

/** ▶ on the arrangement: plays the timeline from the position, following the playhead again if a scroll paused it. */
export const playArrangementFromPosition = (controls: Pick<EngineControls, 'playArrangement'>): void => {
  const view = useArrangementView.getState()
  view.resumeFollow()
  controls.playArrangement(view.position)
}

/**
 * ■ on the arrangement: stops, and the position stays where playback started, so ▶ plays from there again. Pressed while
 * stopped, it puts the position back at 0.
 */
export const stopArrangement = (controls: Pick<EngineControls, 'stop'>): void => {
  if (useStatusStore.getState().status?.playing) controls.stop()
  else useArrangementView.getState().setPosition(0)
}

/** A click in the ruler: the position goes there, and while the arrangement plays, playback jumps there too. */
export const setArrangementPosition = (controls: Pick<EngineControls, 'playArrangement'>, beat: number): void => {
  useArrangementView.getState().setPosition(beat)
  const status = useStatusStore.getState().status
  if (status?.playing && status.mode === 'arrangement') controls.playArrangement(useArrangementView.getState().position)
}
