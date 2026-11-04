import { frameCount, monoAt } from '../../sample'
import { centsToRatio, midiToFrequency } from '../../shared'
import { Params } from '../params'
import type { DspNode, NodeDefinition, ParamSpec, ProcessContext } from '../types'

const MODES = ['one-shot', 'hold', 'loop'] as const
/** Fade applied when a held/looping sample is released, to avoid a click. */
const RELEASE_SECONDS = 0.01

const PARAMS: readonly ParamSpec[] = [
  { id: 'mode', label: 'Mode', min: 0, max: MODES.length - 1, default: 0, step: 1, options: MODES },
  { id: 'root', label: 'Root note', min: 0, max: 127, default: 60, step: 1, format: 'midiNote' },
  { id: 'start', label: 'Start', min: 0, max: 0.95, default: 0 },
  { id: 'tune', label: 'Tune', min: -1200, max: 1200, default: 0, step: 1, unit: 'ct' },
]

/**
 * Plays a library sample, re-pitched so that the `root` note plays it at its original speed.
 * A rising gate triggers it from `start`. one-shot plays to the end whatever the gate does;
 * hold stops when the gate falls; loop repeats until the gate falls: the sample's loop when it has one
 * (`SampleLookup.loopOf`), else from `start` to the end.
 */
class Sampler implements DspNode {
  private readonly params = new Params(PARAMS)
  private sampleId: string | null = null
  private position = 0
  private playing = false
  private releasing = false
  private fade = 1
  private gateWasOn = false

  setParam(id: string, value: number): void {
    this.params.set(id, value)
  }

  setSample(sampleId: string | null): void {
    this.sampleId = sampleId
  }

  process(
    { frames, sampleRate, samples }: ProcessContext,
    [frequencyIn, gateIn]: ReadonlyArray<Float32Array | null>,
    [out]: readonly Float32Array[],
  ): void {
    if (!out) return
    const sample = this.sampleId === null ? undefined : samples.get(this.sampleId)
    const length = sample ? frameCount(sample) : 0
    const mode = MODES[Math.round(this.params.get('mode'))] ?? 'one-shot'
    const rootFrequency = midiToFrequency(this.params.get('root'))
    const tune = centsToRatio(this.params.get('tune'))
    const loopStart = Math.floor(this.params.get('start') * length)
    const fadeStep = 1 / (RELEASE_SECONDS * sampleRate)
    const speed = sample ? (tune * sample.sampleRate) / sampleRate : 0
    // The sample's loop, inside the audio, in *loop* mode only. Without one, everything below is as it always was.
    const saved = mode === 'loop' && this.sampleId !== null && length > 0 ? samples.loopOf(this.sampleId) : undefined
    const loopTo = saved ? Math.min(saved.to, length) : 0
    const loopFrom = saved ? Math.min(saved.from, loopTo - 1) : 0
    const hasLoop = saved !== undefined && loopFrom >= 0 && loopTo > loopFrom

    for (let i = 0; i < frames; i++) {
      const gateOn = (gateIn?.[i] ?? 0) > 0.5
      if (gateOn && !this.gateWasOn) {
        this.position = loopStart
        this.playing = length > 0
        this.releasing = false
        this.fade = 1
      }
      if (!gateOn && this.gateWasOn && mode !== 'one-shot') this.releasing = true
      this.gateWasOn = gateOn

      if (!this.playing || !sample) {
        out[i] = 0
        continue
      }

      const index = Math.floor(this.position)
      const fraction = this.position - index
      const looping = mode === 'loop' && !this.releasing
      // With a loop, a held voice wraps at its end to its start; one that started past its end plays to the sample's
      // end first. Without, it wraps at the sample's end to `start`.
      const end = hasLoop && this.position < loopTo ? loopTo : length
      const wrapTo = hasLoop ? loopFrom : loopStart
      const nextIndex = index + 1 < end ? index + 1 : looping ? wrapTo : index + 1 < length ? index + 1 : -1
      const a = monoAt(sample, index)
      const b = nextIndex >= 0 ? monoAt(sample, nextIndex) : 0
      out[i] = (a + (b - a) * fraction) * this.fade

      const frequency = frequencyIn ? (frequencyIn[i] ?? rootFrequency) : rootFrequency
      this.position += (frequency / rootFrequency) * speed

      if (looping && this.position >= end) {
        this.position = hasLoop
          ? loopFrom + ((this.position - end) % (loopTo - loopFrom))
          : loopStart + ((this.position - length) % Math.max(1, length - loopStart))
      } else if (this.position >= length) {
        this.playing = false
      }
      if (this.releasing) {
        this.fade -= fadeStep
        if (this.fade <= 0) this.playing = false
      }
    }
  }
}

export const samplerNode: NodeDefinition = {
  type: 'sampler',
  label: 'Sampler',
  inputs: [
    { id: 'freq', label: 'Freq' },
    { id: 'gate', label: 'Gate' },
  ],
  outputs: [{ id: 'out', label: 'Out' }],
  params: PARAMS,
  usesSample: true,
  create: () => new Sampler(),
}
