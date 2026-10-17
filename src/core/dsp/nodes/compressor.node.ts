import { Params } from '../params'
import { RIGHT, STEREO_FRAMES } from '../stereo'
import type { DspNode, NodeDefinition, ParamSpec, ProcessContext } from '../types'
import { FOLLOW_MODES, Follower, smoothingCoefficient } from './analysis/follower'
import { toDecibels } from './analysis/level.node'

const PARAMS: readonly ParamSpec[] = [
  { id: 'threshold', label: 'Threshold', min: -60, max: 0, default: -18, unit: 'dB' },
  { id: 'ratio', label: 'Ratio', min: 1, max: 20, default: 4 },
  { id: 'attack', label: 'Attack', min: 0.1, max: 100, default: 10, unit: 'ms' },
  { id: 'release', label: 'Release', min: 5, max: 500, default: 120, unit: 'ms' },
  { id: 'knee', label: 'Knee', min: 0, max: 24, default: 6, unit: 'dB' },
  { id: 'makeup', label: 'Make-up', min: 0, max: 24, default: 0, unit: 'dB' },
  { id: 'mix', label: 'Mix', min: 0, max: 1, default: 1, step: 0.01 },
  { id: 'detector', label: 'Detector', min: 0, max: FOLLOW_MODES.length - 1, default: 0, step: 1, options: FOLLOW_MODES },
]

/**
 * How many dB to turn down at a level that is `over` dB above the threshold: none below the knee, a hard slope above it,
 * and a smooth curve in between. The curve joins the hard slope with matching value and slope at the knee edge, and (unlike
 * a hard knee) it starts before the threshold, which is why it turns a just-over-threshold sound down a little already.
 */
export const reductionDb = (over: number, slope: number, knee: number): number => {
  if (over <= -knee / 2) return 0
  if (over >= knee / 2) return slope * over
  return (slope * (over + knee / 2) ** 2) / (2 * knee)
}

/**
 * Turns the sound down when it gets loud, and back up when it is quiet again. The detector is whatever is wired into
 * `Sidechain` (another track's sound, to duck under it), or the sound itself when it is unwired; it is averaged to mono,
 * so both channels share one gain and the stereo image never wanders. Runs once on the mix of all voices.
 */
class Compressor implements DspNode {
  private readonly params = new Params(PARAMS)
  private readonly follower = new Follower()

  setParam(id: string, value: number): void {
    this.params.set(id, value)
  }

  process(
    { frames, sampleRate }: ProcessContext,
    [input, sidechain]: ReadonlyArray<Float32Array | null>,
    [out, gr]: readonly Float32Array[],
  ): void {
    if (!out) return
    const attack = smoothingCoefficient(this.params.get('attack'), sampleRate)
    const release = smoothingCoefficient(this.params.get('release'), sampleRate)
    const threshold = this.params.get('threshold')
    const slope = 1 - 1 / this.params.get('ratio')
    const knee = this.params.get('knee')
    const makeup = this.params.get('makeup')
    const mix = this.params.get('mix')
    const rms = Math.round(this.params.get('detector')) === 1
    const detect = sidechain ?? input

    // The detector as one mono number: both channels of a stereo buffer averaged, one channel of a mono one.
    const detectorAt = (i: number): number => {
      if (!detect) return 0
      const left = detect[i] ?? 0
      return detect.length === STEREO_FRAMES ? (left + (detect[RIGHT + i] ?? 0)) * 0.5 : left
    }

    for (let i = 0; i < frames; i++) {
      const dry = input?.[i] ?? 0
      const level = toDecibels(this.follower.next(detectorAt(i), attack, release, rms))
      const reduction = reductionDb(level - threshold, slope, knee)
      const gain = 10 ** ((makeup - reduction) / 20)
      out[i] = (dry * gain) * mix + dry * (1 - mix)
      if (out.length === STEREO_FRAMES) {
        const dryRight = input?.[RIGHT + i] ?? 0
        out[RIGHT + i] = (dryRight * gain) * mix + dryRight * (1 - mix)
      }
      if (gr) gr[i] = reduction
    }
  }
}

export const compressorNode: NodeDefinition = {
  type: 'compressor',
  label: 'Compressor',
  inputs: [
    { id: 'in', label: 'In' },
    { id: 'sidechain', label: 'Sidechain' },
  ],
  outputs: [
    { id: 'out', label: 'Out' },
    { id: 'gr', label: 'GR', kind: 'control' },
  ],
  params: PARAMS,
  shared: true,
  stereoCapable: true,
  create: () => new Compressor(),
}
