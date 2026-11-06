import { afterEach, describe, expect, it } from 'vitest'
import { Engine } from '@core'
import { useStatusStore } from './status-store'
import { setTouchClock, touchBeatNow, touchPositionNow } from './touch-store'

afterEach(() => { setTouchClock(); useStatusStore.setState({ status: null, audioFailure: null }) })

describe('the touch clock', () => {
  it('reads positions from the audio clock, and a beat-only reader takes the status run and loop pass', () => {
    const status = { ...new Engine(8000).status(), playing: true, beat: 5, run: 3, lap: 2 }
    useStatusStore.setState({ status })
    setTouchClock((ago = 0) => ({ beat: 9 - ago / 1000, lap: 1, run: 4 }))
    expect(touchPositionNow()).toEqual({ beat: 9, lap: 1, run: 4 })
    expect(touchBeatNow(1000)).toBe(8)
    setTouchClock((ago = 0) => 7 - ago / 1000)
    expect(touchPositionNow()).toEqual({ beat: 7, lap: 2, run: 3 })
    expect(touchBeatNow(500)).toBe(6.5)
    setTouchClock(() => undefined)
    expect(touchPositionNow()).toBeUndefined()
    setTouchClock()
    expect(touchPositionNow()).toEqual({ beat: 5, lap: 2, run: 3 })
  })
})
