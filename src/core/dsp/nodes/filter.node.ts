import { Params } from '../params'
import type { DspNode, NodeDefinition, ParamSpec, ProcessContext } from '../types'

const MODES = ['lowpass', 'highpass', 'bandpass'] as const

const PARAMS: readonly ParamSpec[] = [
  { id: 'mode', label: 'Mode', min: 0, max: MODES.length - 1, default: 0, step: 1, options: MODES },
  { id: 'cutoff', label: 'Cutoff', min: 20, max: 20000, default: 2000, unit: 'Hz' },
  { id: 'resonance', label: 'Res', min: 0.1, max: 20, default: 0.707 },
  { id: 'cvAmount', label: 'CV amt', min: 0, max: 6, default: 2, step: 0.01, unit: 'oct' },
  { id: 'keyTrack', label: 'Key track', min: 0, max: 1, default: 0, step: 0.01 },
]

/** The note at which key tracking leaves the cutoff where the knob says: middle C. */
const KEY_TRACK_CENTRE = 261.6256

/**
 * How much the voice's note moves the cutoff: 0 not at all, 1 by the same ratio as the note (an octave up, an octave
 * brighter), in between partway. Outside a voice (a shared or insert stage) there is no note, so nothing moves.
 */
const keyTrackRatio = (frequency: number, amount: number): number =>
  amount > 0 && frequency > 0 ? (frequency / KEY_TRACK_CENTRE) ** amount : 1

interface Coefficients {
  b0: number
  b1: number
  b2: number
  a1: number
  a2: number
}

/** RBJ cookbook biquad. */
const designBiquad = (mode: number, cutoff: number, q: number, sampleRate: number): Coefficients => {
  const w0 = (2 * Math.PI * Math.min(cutoff, sampleRate * 0.45)) / sampleRate
  const cosW0 = Math.cos(w0)
  const alpha = Math.sin(w0) / (2 * q)
  const a0 = 1 + alpha

  let b0: number, b1: number, b2: number
  switch (MODES[mode]) {
    case 'highpass':
      b0 = (1 + cosW0) / 2
      b1 = -(1 + cosW0)
      b2 = b0
      break
    case 'bandpass':
      b0 = alpha
      b1 = 0
      b2 = -alpha
      break
    default:
      b0 = (1 - cosW0) / 2
      b1 = 1 - cosW0
      b2 = b0
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: (-2 * cosW0) / a0, a2: (1 - alpha) / a0 }
}

/** How many samples share one set of coefficients while the cutoff is being modulated. */
const MODULATION_BLOCK = 16

/**
 * The `cutoff` input moves the cutoff exponentially: a CV of +1 raises it by CV amount octaves, −1 lowers it
 * by the same. Coefficients are redesigned every few samples, which is smooth enough to sound continuous.
 */
class Filter implements DspNode {
  private readonly params = new Params(PARAMS)
  private coefficients: Coefficients | null = null
  private z1 = 0
  private z2 = 0
  /** The key-tracking ratio the coefficients were designed for. */
  private tracked = 1

  setParam(id: string, value: number): void {
    if (this.params.set(id, value)) this.coefficients = null
  }

  process(
    { frames, sampleRate, note }: ProcessContext,
    [input, cutoffCv]: ReadonlyArray<Float32Array | null>,
    [out]: readonly Float32Array[],
  ): void {
    if (!out) return
    const octaves = this.params.get('cvAmount')
    const modulated = cutoffCv !== null && cutoffCv !== undefined && octaves > 0
    const tracked = keyTrackRatio(note.frequency, this.params.get('keyTrack'))
    if (tracked !== this.tracked) {
      this.tracked = tracked
      this.coefficients = null
    }
    const cutoff = this.params.get('cutoff') * tracked
    this.coefficients ??= designBiquad(
      Math.round(this.params.get('mode')),
      cutoff,
      this.params.get('resonance'),
      sampleRate,
    )
    let { b0, b1, b2, a1, a2 } = this.coefficients

    for (let i = 0; i < frames; i++) {
      if (modulated && i % MODULATION_BLOCK === 0) {
        ;({ b0, b1, b2, a1, a2 } = designBiquad(
          Math.round(this.params.get('mode')),
          cutoff * 2 ** ((cutoffCv[i] ?? 0) * octaves),
          this.params.get('resonance'),
          sampleRate,
        ))
      }
      const x = input?.[i] ?? 0
      const y = b0 * x + this.z1
      this.z1 = b1 * x - a1 * y + this.z2
      this.z2 = b2 * x - a2 * y
      out[i] = y
    }
  }
}

export const filterNode: NodeDefinition = {
  type: 'filter',
  label: 'Filter',
  inputs: [
    { id: 'in', label: 'In' },
    { id: 'cutoff', label: 'Cutoff', control: true },
  ],
  outputs: [{ id: 'out', label: 'Out' }],
  params: PARAMS,
  stereoCapable: true,
  create: () => new Filter(),
}
