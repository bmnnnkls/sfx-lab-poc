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

it('keeps Recorded CCs sorted and valid: 1, 64, 120 and up, fractions and duplicates are dropped on load and refused when ticked', () => {
  useRecordSettings.getState().restore({ recordedCCs: [74, 1, 64, 2, 74, 120, 7.5, -1, '11', 0] })
  expect(useRecordSettings.getState().recordedCCs).toEqual([0, 2, 74])
  useRecordSettings.getState().restore({ recordedCCs: 'all' })
  expect(useRecordSettings.getState().recordedCCs).toEqual([])
  const { setRecordedCC } = useRecordSettings.getState()
  setRecordedCC(74, true); setRecordedCC(11, true); setRecordedCC(1, true); setRecordedCC(64, true); setRecordedCC(11, true)
  expect(useRecordSettings.getState().recordedCCs).toEqual([11, 74])
  setRecordedCC(74, false)
  expect(recordSettingsOf(useRecordSettings.getState()).recordedCCs).toEqual([11])
})
