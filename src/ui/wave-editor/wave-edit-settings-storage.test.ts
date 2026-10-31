import { DEFAULT_WAVE_EDIT_SETTINGS, useWaveEditSettings } from '@state'
import { beforeEach, describe, expect, it } from 'vitest'
import { readWaveEditSettings } from './use-wave-edit-settings-storage'

/** What the toolbar saved before the settings moved to `state` (round 11b). */
const SAVED_BY_11B: Readonly<Record<string, string>> = {
  'sfxlab:wave-edit-copies': 'true',
  'sfxlab:wave-crossfade': '{"seconds":0.012,"curve":"equal-power"}',
  'sfxlab:wave-fade-curve': '"s-curve"',
  'sfxlab:wave-edit-settings': '{"gain":{"db":-6},"normalize":{"peakDb":-1,"linked":0},"insert":{"seconds":null}}',
  'sfxlab:wave-loop': 'true',
}

const restore = (saved: Readonly<Record<string, string>>) => useWaveEditSettings.getState().restore(readWaveEditSettings((key) => saved[key] ?? null))
const settings = () => {
  const { asCopy, crossfade, fadeCurve, lastValues, loop, snap } = useWaveEditSettings.getState()
  return { asCopy, crossfade, fadeCurve, lastValues, loop, snap }
}

beforeEach(() => useWaveEditSettings.setState(DEFAULT_WAVE_EDIT_SETTINGS))

describe('the edit settings in storage', () => {
  it('reads the keys the toolbar and editor saved before', () => {
    restore(SAVED_BY_11B)
    expect(settings()).toEqual({
      asCopy: true,
      crossfade: { seconds: 0.012, curve: 'equal-power' },
      fadeCurve: 's-curve',
      // A field emptied before Apply was saved as null; it is dropped, so the edit takes its default.
      lastValues: { gain: { db: -6 }, normalize: { peakDb: -1, linked: 0 }, insert: {} },
      loop: true,
      // Not saved before: off.
      snap: { beats: false, zero: false },
    })
  })

  it('reads the snap settings under one key, and refuses a partial or bad one', () => {
    restore({ 'sfxlab:wave-snap': '{"beats":true,"zero":false}' })
    expect(settings().snap).toEqual({ beats: true, zero: false })
    restore({ 'sfxlab:wave-snap': '{"beats":true}' })
    expect(settings().snap).toEqual(DEFAULT_WAVE_EDIT_SETTINGS.snap)
    useWaveEditSettings.getState().setSnap({ zero: true })
    expect(settings().snap).toEqual({ beats: false, zero: true })
  })

  it('keeps the defaults for missing, unreadable and bad values, field by field', () => {
    restore({})
    expect(settings()).toEqual(DEFAULT_WAVE_EDIT_SETTINGS)
    restore({
      'sfxlab:wave-edit-copies': '"yes"',
      'sfxlab:wave-crossfade': '{"seconds":0.01,"curve":"s-curve"}',
      'sfxlab:wave-fade-curve': 'not json',
      'sfxlab:wave-edit-settings': '{"gain":-6}',
    })
    expect(settings()).toEqual(DEFAULT_WAVE_EDIT_SETTINGS)
    restore({ 'sfxlab:wave-crossfade': '{"seconds":5,"curve":"linear"}', 'sfxlab:wave-fade-curve': '"slow-start"' })
    expect(settings()).toEqual({ ...DEFAULT_WAVE_EDIT_SETTINGS, crossfade: { seconds: 0.1, curve: 'linear' }, fadeCurve: 'slow-start' })
  })
})
