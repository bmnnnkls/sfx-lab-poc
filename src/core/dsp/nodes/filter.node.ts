import { Params } from '../params'
import type { DspNode, NodeDefinition, ParamSpec, ProcessContext } from '../types'
import { designBiquad, FILTER_MODES, type Coefficients } from './biquad'

const PARAMS: readonly ParamSpec[] = [
  { id: 'mode', label: 'Mode', min: 0, max: FILTER_MODES.length - 1, default: 0, step: 1, options: FILTER_MODES },
  { id: 'cutoff', label: 'Cutoff', min: 20, max: 20000, default: 2000, unit: 'Hz' },
  { id: 'resonance', label: 'Res', min: 0.1, max: 20, default: 0.707 },
  { id: 'cvAmount', label: 'CV amt', min: 0, max: 6, default: 2, step: 0.01, unit: 'oct' },
  { id: 'keyTrack', label: 'Key track', min: 0, max: 1, default: 0, step: 0.01 },
  { id: 'gain', label: 'Gain', min: -24, max: 24, default: 0, unit: 'dB' },
  { id: 'slope', label: 'Slope', min: 0, max: 1, default: 0, step: 1, options: ['12 dB', '24 dB'] },
]

/** The note at which key tracking leaves the cutoff where the knob says: middle C. */
const KEY_TRACK_CENTRE = 261.6256

/**
 * How much the voice's note moves the cutoff: 0 not at all, 1 by the same ratio as the note (an octave up, an octave
 * brighter), in between partway. Outside a voice (a shared or insert stage) there is no note, so nothing moves.
 */
const keyTrackRatio = (frequency: number, amount: number): number =>
  amount > 0 && frequency > 0 ? (frequency / KEY_TRACK_CENTRE) ** amount : 1

/** How many samples share one set of coefficients while the cutoff is being modulated. */
const MODULATION_BLOCK = 16

/**
 * The `cutoff` input moves the cutoff exponentially: a CV of +1 raises it by CV amount octaves, −1 lowers it
 * by the same. Coefficients are redesigned every few samples, which is smooth enough to sound continuous.
 * At 24 dB two identical biquads run in a row, with their own state, on the same coefficients.
 */
class Filter implements DspNode {
  private readonly params = new Params(PARAMS)
  private coefficients: Coefficients | null = null
  private z1 = 0
  private z2 = 0
  private z3 = 0
  private z4 = 0
  /** The key-tracking ratio the coefficients were designed for. */
  private tracked = 1
  private slope24 = false

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
    const slope24 = Math.round(this.params.get('slope')) === 1
    if (slope24 !== this.slope24) {
      this.slope24 = slope24
      this.coefficients = null
    }
    const mode = Math.round(this.params.get('mode'))
    const q = this.params.get('resonance')
    const gainDb = this.params.get('gain')
    let c: Coefficients = this.coefficients ??= designBiquad(mode, cutoff, q, sampleRate, gainDb)

    for (let i = 0; i < frames; i++) {
      if (modulated && i % MODULATION_BLOCK === 0) {
        c = this.coefficients = designBiquad(
          mode,
          cutoff * 2 ** ((cutoffCv[i] ?? 0) * octaves),
          q,
          sampleRate,
          gainDb,
        )
      }
      const x = input?.[i] ?? 0
      let y = c.b0 * x + this.z1
      this.z1 = c.b1 * x - c.a1 * y + this.z2
      this.z2 = c.b2 * x - c.a2 * y
      if (slope24) {
        const w = c.b0 * y + this.z3
        this.z3 = c.b1 * y - c.a1 * w + this.z4
        this.z4 = c.b2 * y - c.a2 * w
        y = w
      }
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
