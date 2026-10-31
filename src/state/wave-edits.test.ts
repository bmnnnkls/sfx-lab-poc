import { type SampleAudio, type SampleEditEntry, type SampleInfo, SAMPLE_EDITS, addSamples, buildPeakPyramid, createDemoProject, originOf } from '@core'
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeContext } from './actions/test-support'
import { audioClipboard } from './audio-clipboard'
import { useProjectStore } from './project-store'
import { NO_WAVE_PANES, useWaveAudioStore } from './wave-audio-store'
import { type WaveAt, waveViewKey } from './wave-panes'
import { DEFAULT_WAVE_EDIT_SETTINGS, useWaveEditSettings } from './wave-edit-settings'
import { DEFAULT_WAVE_VIEW, type WaveSelection, useWaveEditorStore } from './wave-editor-store'
import { type WaveEditFacts, copyWave, cutWave, openWave, runWaveEdit, waveCopyBlocked, waveCutBlocked, waveEditBlocked, waveEditContext, waveEditFacts } from './wave-edits'

const RATE = 8000
const audioOf = (channels: number, frames = 800): SampleAudio => ({
  sampleRate: RATE,
  channels: Array.from({ length: channels }, (_, channel) => Float32Array.from({ length: frames }, (_, i) => Math.sin(i / (10 + channel)) / 2)),
})
const sampleOf = (id: string, channels: number): SampleInfo => ({ id, name: id, extension: 'wav', durationSeconds: 0.1, sampleRate: RATE, channels, bytes: 1000 })
const mono = sampleOf('mono', 1)
const stereo = sampleOf('stereo', 2)
/** The sample in the first pane. */
const at = (sample: SampleInfo | string): WaveAt => ({ sampleId: typeof sample === 'string' ? sample : sample.id, pane: 'main' })

/** Opens a sample in the editor: in the project, its working copy loaded, with a selection and cursor. */
const open = (sample: SampleInfo, selection: WaveSelection | null = null, cursor = 0) => {
  const audio = audioOf(sample.channels)
  const key = waveViewKey('main', originOf(sample))
  useWaveAudioStore.setState({ panes: { ...NO_WAVE_PANES, main: { sampleId: sample.id, pane: 'main', viewKey: key, audio, pyramid: buildPeakPyramid(audio) } }, editing: null, loading: NO_WAVE_PANES })
  useWaveEditorStore.getState().setView(key, { cursor })
  useWaveEditorStore.getState().select(key, selection)
  return audio
}

const entry = (kind: keyof typeof SAMPLE_EDITS) => SAMPLE_EDITS[kind] as unknown as SampleEditEntry
const facts = (change: Partial<WaveEditFacts> = {}): WaveEditFacts => ({
  busy: false,
  loaded: true,
  selection: { from: 10, to: 20, channels: 'both' },
  clipboard: true,
  channelCount: 2,
  ...change,
})

beforeEach(() => {
  useProjectStore.getState().resetProject(addSamples(createDemoProject(), [mono, stereo]))
  useWaveEditorStore.setState({ views: {} })
  useWaveAudioStore.setState({ panes: NO_WAVE_PANES, editing: null, loading: NO_WAVE_PANES })
  useWaveEditSettings.setState(DEFAULT_WAVE_EDIT_SETTINGS)
  audioClipboard.set(null)
})

describe('openWave', () => {
  it("gives a pane its own view of a sample, and the working copy only to the pane that holds it", () => {
    open(stereo, { from: 100, to: 300, channels: 'both' }, 50)
    const second = openWave({ sampleId: stereo.id, pane: 'second' })!
    expect(second.key).toBe(`second:${originOf(stereo)}`)
    expect(second.view).toEqual(DEFAULT_WAVE_VIEW)
    expect(second.wave).toBeNull()
    expect(openWave(at(stereo))).toMatchObject({ key: `main:${originOf(stereo)}`, view: { cursor: 50, selection: { from: 100, to: 300 } } })
    expect(openWave(at(stereo))!.wave).not.toBeNull()
    expect(openWave(at('gone'))).toBeUndefined()
  })
})

describe('waveEditBlocked', () => {
  const left: WaveSelection = { from: 10, to: 20, channels: 'left' }
  it.each([
    ['nothing in the way', 'delete', facts(), null],
    ['an edit running', 'gain', facts({ busy: true }), 'An edit is running'],
    ['no audio', 'reverse', facts({ loaded: false }), 'The audio is not loaded'],
    ['no selection, for an edit that needs one', 'crop', facts({ selection: null }), 'Select a part first'],
    ['no selection, for a process', 'reverse', facts({ selection: null }), null],
    ['nothing copied', 'replace', facts({ clipboard: false }), 'Copy some audio first'],
    ['one channel, for an edit that changes the length', 'delete', facts({ selection: left }), 'Select both channels to delete'],
    ['one channel, for Insert silence…', 'insert', facts({ selection: left }), 'Select both channels to insert silence'],
    ['one channel, for a process', 'gain', facts({ selection: left }), null],
    ['a mono sample', 'delete', facts({ channelCount: 1, selection: left }), null],
  ] as const)('%s', (_, kind, given, expected) => {
    expect(waveEditBlocked(entry(kind), given)).toBe(expected)
  })

  it('lets Copy run without a clipboard and while an edit runs, and words Cut as a cut', () => {
    expect(waveCopyBlocked(facts({ busy: true, clipboard: false }))).toBeNull()
    expect(waveCopyBlocked(facts({ selection: null }))).toBe('Select a part first')
    expect(waveCopyBlocked(facts({ loaded: false }))).toBe('The audio is not loaded')
    expect(waveCutBlocked(facts({ selection: left }))).toBe('Select both channels to cut')
    expect(waveCutBlocked(facts({ busy: true }))).toBe('An edit is running')
    expect(waveCutBlocked(facts())).toBeNull()
  })
})

describe('waveEditContext', () => {
  it("is what the toolbar built: the view's selection and cursor, the audio's shape, the settings and the clipboard", () => {
    for (const sample of [mono, stereo]) {
      const audio = open(sample, { from: 100, to: 300, channels: 'both' }, 50)
      useWaveEditSettings.getState().setCrossfade({ seconds: 0.01, curve: 'equal-power' })
      useWaveEditSettings.getState().setFadeCurve('s-curve')
      expect(waveEditContext(openWave(at(sample))!, { db: -6 })).toEqual({
        selection: { from: 100, to: 300, channels: 'both' },
        frames: 800,
        sampleRate: RATE,
        channelCount: sample.channels,
        crossfade: { seconds: 0.01, curve: 'equal-power' },
        fadeCurve: 's-curve',
        settings: { db: -6 },
        cursor: 50,
        clipboard: null,
      })
      expect(audio.channels).toHaveLength(sample.channels)
    }
  })

  it("takes the saved length and channels while the audio isn't loaded", () => {
    const facts = waveEditFacts(stereo, null, null)
    expect(facts).toMatchObject({ loaded: false, channelCount: 2 })
    expect(waveEditContext({ sample: stereo, wave: null, view: DEFAULT_WAVE_VIEW })).toMatchObject({ frames: 800, channelCount: 2 })
  })
})

describe('running edits', () => {
  it('runs an edit through editSample, with the settings, and remembers the values and the curve', async () => {
    open(stereo, { from: 100, to: 300, channels: 'left' })
    useWaveEditSettings.getState().setAsCopy(true)
    const context = fakeContext()
    await runWaveEdit(context.samples, at(stereo), 'gain', { values: { db: -6 } })
    await runWaveEdit(context.samples, at(stereo), 'fade', { variant: 'out', curve: 'slow-start' })
    expect(context.calls).toHaveLength(2)
    expect(context.calls[0]).toMatch(/^samples\.editSample\("stereo", \{"kind":"gain","range":\{"from":100,"to":300\},"channels":"left","db":-6,.*\{"asCopy":true,"pane":"main"\}\)$/)
    expect(context.calls[1]).toContain('"kind":"fade","range":{"from":100,"to":300},"channels":"left","direction":"out","curve":"slow-start"')
    expect(useWaveEditSettings.getState()).toMatchObject({ fadeCurve: 'slow-start', lastValues: { gain: { db: -6 } } })
  })

  it("runs nothing that can't run now, or on a sample that isn't open", () => {
    open(stereo, { from: 100, to: 300, channels: 'left' })
    const context = fakeContext()
    expect(runWaveEdit(context.samples, at(stereo), 'delete')).toBeUndefined()
    expect(runWaveEdit(context.samples, at(mono), 'reverse')).toBeUndefined()
    expect(runWaveEdit(context.samples, at('gone'), 'reverse')).toBeUndefined()
    useWaveAudioStore.getState().setEditing(stereo.id)
    expect(runWaveEdit(context.samples, at(stereo), 'reverse')).toBeUndefined()
    expect(context.calls).toEqual([])
  })

  it('copies the selection; Cut copies it, then deletes it', async () => {
    open(stereo)
    expect(copyWave(at(stereo))).toBe(false)
    open(stereo, { from: 100, to: 300, channels: 'both' })
    expect(copyWave(at(stereo))).toBe(true)
    expect(audioClipboard.get()?.audio.channels[0]).toHaveLength(200)
    audioClipboard.set(null)
    const context = fakeContext()
    await cutWave(context.samples, at(stereo))
    expect(audioClipboard.get()?.audio.channels).toHaveLength(2)
    expect(context.calls).toHaveLength(1)
    expect(context.calls[0]).toContain('"kind":"delete","range":{"from":100,"to":300}')
  })

  it("cuts nothing, and copies nothing, when the delete can't run", () => {
    open(stereo, { from: 100, to: 300, channels: 'right' })
    const context = fakeContext()
    expect(cutWave(context.samples, at(stereo))).toBeUndefined()
    expect(audioClipboard.get()).toBeNull()
    expect(context.calls).toEqual([])
  })
})
