import { type SampleAudio, type SampleEditEntry, type SampleInfo, SAMPLE_EDITS, addSamples, buildPeakPyramid, copyAudioRange, createDemoProject, originOf } from '@core'
import { beforeEach, describe, expect, it } from 'vitest'
import { audioClipboard } from '../audio-clipboard'
import { useProjectStore } from '../project-store'
import { useSampleStore } from '../sample-store'
import { useStatusStore } from '../status-store'
import { useWaveAudioStore } from '../wave-audio-store'
import { DEFAULT_WAVE_EDIT_SETTINGS, useWaveEditSettings } from '../wave-edit-settings'
import { type WaveSelection, useWaveEditorStore, waveViewOf } from '../wave-editor-store'
import { type ActionItem, type Subject, describeActions, processActions, runAction, subjectName, verbTarget } from '.'
import { fakeContext } from './test-support'

const RATE = 8000
const audioOf = (channels: number): SampleAudio => ({
  sampleRate: RATE,
  channels: Array.from({ length: channels }, () => Float32Array.from({ length: 800 }, (_, i) => Math.sin(i / 10) / 2)),
})
const stereo: SampleInfo = { id: 'stereo', name: 'Pad', extension: 'wav', durationSeconds: 0.1, sampleRate: RATE, channels: 2, bytes: 1000 }
const subject: Subject = { kind: 'sample-selection', sampleId: stereo.id }

const open = (selection: WaveSelection | null) => {
  const audio = audioOf(2)
  useWaveAudioStore.setState({ current: { sampleId: stereo.id, viewKey: originOf(stereo), audio, pyramid: buildPeakPyramid(audio) }, editing: null, loading: null })
  useWaveEditorStore.getState().select(originOf(stereo), selection)
  return audio
}
const view = () => waveViewOf(useWaveEditorStore.getState().views, originOf(stereo))
const items = (): Readonly<Record<string, ActionItem>> => Object.fromEntries(describeActions(subject, fakeContext()).map((item) => [item.id, item]))
const both: WaveSelection = { from: 100, to: 300, channels: 'both' }

beforeEach(() => {
  useProjectStore.getState().resetProject(addSamples(createDemoProject(), [stereo]))
  useWaveEditorStore.setState({ views: {} })
  useWaveAudioStore.setState({ current: null, editing: null, loading: null })
  useWaveEditSettings.setState(DEFAULT_WAVE_EDIT_SETTINGS)
  useSampleStore.setState({ status: { [stereo.id]: 'ready' } })
  useStatusStore.setState({ status: null })
  audioClipboard.set(null)
})

describe('the sample-selection actions', () => {
  it('are the five clipboard and structure edits, the processes, then the view, as on the toolbar', () => {
    open(both)
    expect(describeActions(subject, fakeContext()).map((item) => `${item.group}: ${item.title}`)).toEqual([
      'clipboard: Cut', 'clipboard: Copy', 'clipboard: Paste', 'clipboard: Delete', 'clipboard: Crop',
      'process: Gain…', 'process: Fade in', 'process: Fade out', 'process: Normalize…', 'process: Reverse', 'process: Silence', 'process: Remove DC offset', 'process: Insert silence…',
      'marks: Add marker', 'marks: Make region', 'marks: Set loop',
      'view: Select all', 'view: Zoom to selection', 'view: Zoom to fit', 'view: Play selection',
    ])
    expect(subjectName(subject)).toBe('Selection in Pad')
    expect(describeActions({ kind: 'sample-selection', sampleId: 'gone' }, fakeContext())).toEqual([])
  })

  it("build the processes from the registry's process entries, one for one, a fade once per variant", () => {
    const fromRegistry = (Object.values(SAMPLE_EDITS) as SampleEditEntry[])
      .filter((entry) => entry.group === 'process')
      .flatMap((entry) => entry.variants?.map((variant) => variant.title) ?? [entry.title])
    expect(processActions().map((action) => action.title)).toEqual([...fromRegistry, SAMPLE_EDITS.insert.title])
    // The toolbar's Process ▾ is this group of the subject's actions.
    open(both)
    expect(describeActions(subject, fakeContext()).filter((item) => item.group === 'process').map((item) => item.title)).toEqual([...fromRegistry, SAMPLE_EDITS.insert.title])
  })

  it('are enabled, or say why not, with and without a selection, a clipboard, both channels and a running edit', () => {
    // Nothing loaded yet.
    expect(items()['sample-selection.reverse']).toMatchObject({ enabled: false, tooltip: 'The audio is not loaded' })

    open(null)
    expect(items()['sample-selection.cut']).toMatchObject({ enabled: false, tooltip: 'Select a part first' })
    expect(items()['sample-selection.copy']).toMatchObject({ enabled: false, tooltip: 'Select a part first' })
    expect(items()['sample-selection.delete']).toMatchObject({ enabled: false, tooltip: 'Select a part first' })
    expect(items()['sample-selection.paste']).toMatchObject({ enabled: false, tooltip: 'Copy some audio first' })
    expect(items()['sample-selection.reverse']).toMatchObject({ enabled: true, tooltip: SAMPLE_EDITS.reverse.tooltip })
    expect(items()['sample-selection.zoom-selection']?.enabled).toBe(false)
    expect(items()['sample-selection.play']?.title).toBe('Play from cursor')

    const audio = open(both)
    audioClipboard.set(copyAudioRange(audio, both, [0, 1]))
    for (const id of ['cut', 'copy', 'paste', 'delete', 'crop', 'gain', 'insert', 'zoom-selection']) expect(items()[`sample-selection.${id}`]?.enabled, id).toBe(true)
    expect(items()['sample-selection.cut']?.tooltip).toBe('Copy the selection, then delete it')

    open({ ...both, channels: 'left' })
    expect(items()['sample-selection.cut']).toMatchObject({ enabled: false, tooltip: 'Select both channels to cut' })
    expect(items()['sample-selection.paste']).toMatchObject({ enabled: false, tooltip: 'Select both channels to paste' })
    expect(items()['sample-selection.copy']?.enabled).toBe(true)
    expect(items()['sample-selection.gain']?.enabled).toBe(true)

    useWaveAudioStore.getState().setEditing(stereo.id)
    expect(items()['sample-selection.gain']).toMatchObject({ enabled: false, tooltip: 'An edit is running' })
    expect(items()['sample-selection.copy']?.enabled).toBe(true)
  })

  it('open the settings popover for an edit with settings, and run one without at once', async () => {
    open(both)
    const context = fakeContext()
    await runAction('sample-selection.gain', subject, context)
    expect(view().asking).toBe('gain')
    expect(context.calls).toEqual([])
    await runAction('sample-selection.reverse', subject, context)
    expect(context.calls).toHaveLength(1)
    expect(context.calls[0]).toContain('"kind":"reverse"')
  })

  it("offer the fade curves, the last used first and checked, and remember the one chosen", async () => {
    open(both)
    useWaveEditSettings.getState().setFadeCurve('s-curve')
    const fadeIn = items()['sample-selection.fade-in']!
    expect(fadeIn.choices?.map((choice) => [choice.title, choice.checked])).toEqual([
      ['S-curve', true], ['Linear', false], ['Equal power', false], ['Slow start', false], ['Fast start', false],
    ])
    const context = fakeContext()
    await runAction('sample-selection.fade-out', subject, context, { choice: 'slow-start' })
    expect(context.calls[0]).toContain('"direction":"out","curve":"slow-start"')
    expect(useWaveEditSettings.getState().fadeCurve).toBe('slow-start')
  })

  it('select all on the channels the selection had, zoom, and play or stop the preview', () => {
    open({ ...both, channels: 'right' })
    const context = fakeContext()
    runAction('sample-selection.select-all', subject, context)
    expect(view().selection).toEqual({ from: 0, to: 800, channels: 'right' })
    runAction('sample-selection.zoom-selection', subject, context)
    expect(view().zoomTo).toEqual({ from: 0, to: 800 })
    runAction('sample-selection.zoom-fit', subject, context)
    expect(view().zoomTo).toBe('fit')
    useWaveEditSettings.getState().setLoop(true)
    runAction('sample-selection.play', subject, context)
    expect(context.calls).toEqual(['samples.preview("stereo", {"from":0,"to":800,"loop":true})'])
    useStatusStore.setState({ status: { preview: { sampleId: stereo.id, frame: 10 } } as never })
    expect(items()['sample-selection.play']?.title).toBe('Stop')
    runAction('sample-selection.play', subject, context)
    expect(context.calls.at(-1)).toBe('samples.stopPreview()')
  })
})

describe('the edit keys on the lanes', () => {
  it('find Delete, Copy, Cut and Paste from the lanes\' subject, when they can run', () => {
    const audio = open(both)
    const context = fakeContext()
    expect(verbTarget('delete', [subject], context)?.action.id).toBe('sample-selection.delete')
    expect(verbTarget('copy', [subject], context)?.action.id).toBe('sample-selection.copy')
    expect(verbTarget('cut', [subject], context)?.action.id).toBe('sample-selection.cut')
    expect(verbTarget('paste', [subject], context)).toBeUndefined()
    audioClipboard.set(copyAudioRange(audio, both, [0]))
    expect(verbTarget('paste', [subject], context)?.action.id).toBe('sample-selection.paste')
    open(null)
    expect(verbTarget('delete', [subject], context)).toBeUndefined()
  })
})
