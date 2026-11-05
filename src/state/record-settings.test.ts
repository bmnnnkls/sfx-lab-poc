import { afterEach, expect, it } from 'vitest'
import { DEFAULT_RECORD_SETTINGS, recordSettingsOf, useRecordSettings } from './record-settings'

afterEach(() => useRecordSettings.getState().restore(DEFAULT_RECORD_SETTINGS))

it('restores the count-in field by field: a saved object without it, or with a bad value, gets Off', () => {
  useRecordSettings.getState().restore({ metronome: true, fixedBars: 4 })
  expect(recordSettingsOf(useRecordSettings.getState())).toEqual({ ...DEFAULT_RECORD_SETTINGS, metronome: true, fixedBars: 4, countInBars: 0 })
  useRecordSettings.getState().restore({ countInBars: 2 })
  expect(useRecordSettings.getState().countInBars).toBe(2)
  useRecordSettings.getState().restore({ countInBars: 3 })
  expect(useRecordSettings.getState().countInBars).toBe(0)
  useRecordSettings.getState().setCountIn(1)
  expect(useRecordSettings.getState().countInBars).toBe(1)
  useRecordSettings.getState().setCountIn(4 as never)
  expect(useRecordSettings.getState().countInBars).toBe(1)
})
