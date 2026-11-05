import { afterEach, describe, expect, it, vi } from 'vitest'
import { recordBeat, recordLatencyMs, setRecordClock, transportBeat } from './record-clock'
import { DEFAULT_RECORD_SETTINGS, useRecordSettings } from './record-settings'

afterEach(() => { setRecordClock(); useRecordSettings.setState(DEFAULT_RECORD_SETTINGS); vi.restoreAllMocks() })

describe('the record clock', () => {
  it('is undefined while nothing is connected or the transport is stopped', () => {
    expect(recordBeat(0)).toBeUndefined()
    setRecordClock(() => undefined)
    expect(recordBeat(0)).toBeUndefined()
  })

  it('reads the beat as long ago as the event, plus the output latency and the offset', () => {
    vi.spyOn(performance, 'now').mockReturnValue(10_000)
    const asked: number[] = []
    setRecordClock((agoMs) => { asked.push(agoMs); return 8 - agoMs / 500 }, () => 0.02)
    expect(recordLatencyMs()).toBeCloseTo(20)
    expect(recordBeat(9_900)).toBeCloseTo(8 - 120 / 500)
    useRecordSettings.getState().setLatencyOffset(30)
    expect(recordLatencyMs()).toBeCloseTo(50)
    // A positive offset places notes earlier; a negative one later.
    expect(recordBeat(10_000)).toBeCloseTo(8 - 50 / 500)
    useRecordSettings.getState().setLatencyOffset(-80)
    expect(useRecordSettings.getState().latencyOffsetMs).toBe(-50)
    expect(recordBeat(10_000)).toBeCloseTo(8 + 30 / 500)
    // A stamp from the future (clock skew) counts as now.
    expect(asked.at(-1)).toBeCloseTo(-30)
    expect(recordBeat(10_500)).toBeCloseTo(8 + 30 / 500)
    expect(transportBeat()).toBe(8)
  })
})

describe('the record settings', () => {
  it('restores field by field, keeping the default for what is not valid', () => {
    useRecordSettings.getState().restore({ metronome: true, metronomeLevel: -100, fixedBars: 3, latencyOffsetMs: 12.4 })
    expect(useRecordSettings.getState()).toMatchObject({ metronome: true, metronomeLevel: -40, fixedBars: 0, latencyOffsetMs: 12 })
    useRecordSettings.getState().restore('nonsense')
    expect(useRecordSettings.getState()).toMatchObject(DEFAULT_RECORD_SETTINGS)
    useRecordSettings.getState().restore({ fixedBars: 8, metronomeLevel: -6 })
    expect(useRecordSettings.getState()).toMatchObject({ fixedBars: 8, metronomeLevel: -6 })
  })
})
