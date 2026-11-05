import { afterEach, expect, it } from 'vitest'
import type { AudioHost } from '@audio'
import type { EngineCommand, EngineStatus } from '@core'
import { useRecordSettings, useRecordStore, useStatusStore } from '@state'
import { createEngineControls } from './engine-controls'

const status = (playing: boolean, extra: Partial<EngineStatus> = {}): EngineStatus => ({ playing, mode: 'session', beat: 0, peak: 0, peaks: {}, readouts: {}, tracks: {}, ...extra })
const controls = () => {
  const sent: EngineCommand[] = []
  const host = { start: () => Promise.resolve(), send: (command: EngineCommand) => sent.push(command) } as unknown as AudioHost
  return { sent, controls: createEngineControls(host) }
}

afterEach(() => {
  useRecordStore.getState().setRec(false)
  useRecordSettings.setState({ countInBars: 0 })
  useStatusStore.setState({ status: null })
})

it('counts in a start from a stopped transport with ● Rec on, and runs it at once otherwise', () => {
  const { sent, controls: c } = controls()
  useStatusStore.getState().setStatus(status(false))
  useRecordSettings.setState({ countInBars: 2 })
  c.play()
  expect(sent.pop()).toEqual({ type: 'transport/play' })
  useRecordStore.getState().setRec(true)
  c.launchClip('t', 'c')
  expect(sent.pop()).toEqual({ type: 'transport/countIn', bars: 2, then: { type: 'clip/launch', trackId: 't', clipId: 'c' } })
  c.launchScene(1)
  expect(sent.pop()).toEqual({ type: 'transport/countIn', bars: 2, then: { type: 'scene/launch', scene: 1 } })
  // Counting in already, or playing: the start runs as it is (a launch joins the count-in).
  useStatusStore.getState().setStatus(status(false, { countIn: { barsLeft: 2, beat: -7 } }))
  c.launchClip('t', 'c')
  expect(sent.pop()).toEqual({ type: 'clip/launch', trackId: 't', clipId: 'c' })
  useStatusStore.getState().setStatus(status(true))
  c.play()
  expect(sent.pop()).toEqual({ type: 'transport/play' })
})
