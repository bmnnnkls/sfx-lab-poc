import type { EngineStatus } from '@core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { playArrangementFromPosition, setArrangementPosition, stopArrangement } from './arrangement-transport'
import { DEFAULT_ARRANGEMENT_VIEW, useArrangementView } from './arrangement-view-store'
import { useStatusStore } from './status-store'

const status = (playing: boolean, mode: EngineStatus['mode'] = 'arrangement'): EngineStatus => ({ playing, mode, beat: 0, tempo: 120, peak: 0, peaks: {}, readouts: {}, tracks: {} })
const controls = () => ({ playArrangement: vi.fn(), stop: vi.fn() })

describe('the arrangement transport', () => {
  beforeEach(() => {
    useArrangementView.setState({ ...DEFAULT_ARRANGEMENT_VIEW, position: 16, following: false })
    useStatusStore.setState({ status: status(false) })
  })

  it('plays from the position, following again', () => {
    const engine = controls()
    playArrangementFromPosition(engine)
    expect(engine.playArrangement).toHaveBeenCalledWith(16)
    expect(useArrangementView.getState().following).toBe(true)
  })

  it('stops and keeps the position while playing; stopped, it goes back to 0', () => {
    const engine = controls()
    useStatusStore.setState({ status: status(true) })
    stopArrangement(engine)
    expect(engine.stop).toHaveBeenCalledOnce()
    expect(useArrangementView.getState().position).toBe(16)
    useStatusStore.setState({ status: status(false) })
    stopArrangement(engine)
    expect(engine.stop).toHaveBeenCalledOnce()
    expect(useArrangementView.getState().position).toBe(0)
  })

  it('a click sets the position, and seeks only while the arrangement plays', () => {
    const engine = controls()
    setArrangementPosition(engine, 8)
    expect(useArrangementView.getState().position).toBe(8)
    expect(engine.playArrangement).not.toHaveBeenCalled()
    useStatusStore.setState({ status: status(true, 'session') })
    setArrangementPosition(engine, 4)
    expect(engine.playArrangement).not.toHaveBeenCalled()
    useStatusStore.setState({ status: status(true) })
    setArrangementPosition(engine, 12)
    expect(engine.playArrangement).toHaveBeenCalledWith(12)
  })
})
