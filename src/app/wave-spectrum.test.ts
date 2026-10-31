import { type SpectrumJob, type SpectrumService, createSpectrumService } from '@audio'
import { type SampleAudio, type SampleEdit, type SpectrumPyramid, applySampleEdit, buildPeakPyramid, buildSpectrumPyramid, changedFrames, frameCount } from '@core'
import { DEFAULT_WAVE_EDIT_SETTINGS, NO_WAVE_PANES, type WaveAudio, type WavePane, useWaveAudioStore, useWaveEditSettings, useWaveEditorStore, useWaveSpectrumStore, waveViewKey } from '@state'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWaveSpectra } from './wave-spectrum'

const noise = (length: number, seed: number) => {
  let state = seed
  return Float32Array.from({ length }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return (state / 2 ** 31 - 1) * 0.5
  })
}

const A: SampleAudio = { sampleRate: 48000, channels: [noise(120_000, 1), noise(120_000, 2)] }
const B: SampleAudio = { sampleRate: 48000, channels: [noise(60_000, 3)] }

const wave = (sampleId: string, audio: SampleAudio, pane: WavePane = 'main', editedFrom?: WaveAudio['editedFrom']): WaveAudio => ({
  sampleId,
  pane,
  viewKey: waveViewKey(pane, sampleId),
  audio,
  pyramid: buildPeakPyramid(audio),
  ...(editedFrom && { editedFrom }),
})

/** The main thread's service, keeping each job it was given. */
const recording = () => {
  const jobs: SpectrumJob[] = []
  const inner = createSpectrumService(() => null)
  const service: SpectrumService = {
    spectrumOf: (job, onChunk, onDone) => {
      jobs.push(job)
      return inner.spectrumOf(job, onChunk, onDone)
    },
  }
  return { service, jobs }
}

const spectrum = (sampleId: string) => useWaveSpectrumStore.getState().spectra[sampleId]
const sameBytes = (a: SpectrumPyramid, b: SpectrumPyramid) => a.levels.every((level, index) => level.data.every((data, channel) => Buffer.from(data).equals(Buffer.from(b.levels[index]!.data[channel]!))))
const filled = (sampleId: string) => vi.waitFor(() => expect(spectrum(sampleId)?.pyramid.levels[0]!.filled.every((flag) => flag === 1)).toBe(true), { timeout: 5000 })

let disconnect = () => {}
let jobs: SpectrumJob[] = []
const connect = () => {
  const made = recording()
  jobs = made.jobs
  disconnect = createWaveSpectra(made.service).connect()
}

beforeEach(() => {
  useWaveAudioStore.setState({ panes: NO_WAVE_PANES, loading: NO_WAVE_PANES, editing: null })
  useWaveSpectrumStore.setState({ spectra: {} })
  useWaveEditorStore.setState({ views: {} })
  useWaveEditSettings.getState().restore({})
  useWaveEditSettings.getState().setLanes('spectrogram')
})
afterEach(() => disconnect())

describe('createWaveSpectra', () => {
  it('computes the spectrum of a pane’s sample while the lanes show it, the view’s columns first', async () => {
    useWaveEditorStore.getState().setView(waveViewKey('main', 'a'), { startFrame: 80_000, framesPerPixel: 10 })
    useWaveAudioStore.getState().setPane('main', wave('a', A))
    connect()
    await filled('a')
    expect(sameBytes(spectrum('a')!.pyramid, buildSpectrumPyramid(A, 2048))).toBe(true)
    expect(spectrum('a')!.version).toBe(jobs[0]!.chunks.length)
    expect(jobs[0]!.chunks[0]!.from).toBeLessThanOrEqual(80_000 / 512)
    expect(jobs[0]!.chunks[0]!.to).toBeGreaterThan(80_000 / 512)
  })

  it('computes nothing for the waveform, and drops the spectrum when the lanes go back to it', async () => {
    useWaveEditSettings.getState().setLanes('waveform')
    useWaveAudioStore.getState().setPane('main', wave('a', A))
    connect()
    expect(jobs).toHaveLength(0)
    expect(spectrum('a')).toBeUndefined()
    useWaveEditSettings.getState().setLanes('split')
    await filled('a')
    useWaveEditSettings.getState().setLanes('waveform')
    expect(spectrum('a')).toBeUndefined()
  })

  it('shares one spectrum between two panes on a sample, and computes another pane’s sample on its own', async () => {
    useWaveAudioStore.getState().setPane('main', wave('a', A))
    useWaveAudioStore.getState().setPane('second', wave('a', A, 'second'))
    connect()
    await filled('a')
    expect(jobs).toHaveLength(1)
    useWaveAudioStore.getState().setPane('second', wave('b', B, 'second'))
    await filled('b')
    expect(jobs).toHaveLength(2)
    expect(spectrum('b')!.pyramid.channels).toBe(1)
    expect(spectrum('a')).toBeDefined()
  })

  it('after an edit computes only the columns whose windows touch the change, and ends equal to a build', async () => {
    useWaveAudioStore.getState().setPane('main', wave('a', A))
    connect()
    await filled('a')
    const edit: SampleEdit = { kind: 'gain', range: { from: 50_000, to: 52_000 }, channels: 'both', db: -6, ramp: { frames: 0, curve: 'linear' } }
    const edited = applySampleEdit(A, edit)
    useWaveAudioStore.getState().setPane('main', wave('a2', edited, 'main', { sampleId: 'a', changed: changedFrames(edit, frameCount(A)) }))
    expect(spectrum('a')).toBeUndefined()
    await filled('a2')
    const columns = jobs[1]!.chunks.reduce((total, chunk) => total + chunk.to - chunk.from, 0)
    expect(columns).toBeLessThan(2000 / 512 + 2048 / 512 + 2)
    expect(sameBytes(spectrum('a2')!.pyramid, buildSpectrumPyramid(edited, 2048))).toBe(true)
  })

  it('computes again at a new FFT size, and stops when the pane closes', async () => {
    useWaveAudioStore.getState().setPane('main', wave('a', A))
    connect()
    useWaveEditSettings.getState().setSpectrum({ fftSize: 1024 })
    await filled('a')
    expect(spectrum('a')!.fftSize).toBe(1024)
    expect(spectrum('a')!.pyramid.bins).toBe(513)
    useWaveAudioStore.getState().setPane('main', null)
    expect(spectrum('a')).toBeUndefined()
  })

  it('stops a job whose sample no pane shows any more', async () => {
    useWaveAudioStore.getState().setPane('main', wave('a', A))
    connect()
    const before = useWaveSpectrumStore.getState().spectra.a!.pyramid
    useWaveAudioStore.getState().setPane('main', wave('b', B))
    await filled('b')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(before.levels[0]!.filled.some((flag) => flag === 0)).toBe(true)
  })
})

describe('the spectrum settings', () => {
  it('restore what was saved, and keep the defaults for what is not valid', () => {
    const settings = useWaveEditSettings.getState()
    settings.restore({ lanes: 'split', spectrum: { scale: 'linear', fftSize: 4096, floorDb: -200 } })
    expect(useWaveEditSettings.getState().lanes).toBe('split')
    expect(useWaveEditSettings.getState().spectrum).toEqual({ scale: 'linear', fftSize: 4096, floorDb: -120 })
    settings.restore({ lanes: 'both', spectrum: { scale: 'linear', fftSize: 3000, floorDb: -80 } })
    expect(useWaveEditSettings.getState().lanes).toBe(DEFAULT_WAVE_EDIT_SETTINGS.lanes)
    expect(useWaveEditSettings.getState().spectrum).toEqual(DEFAULT_WAVE_EDIT_SETTINGS.spectrum)
  })
})
