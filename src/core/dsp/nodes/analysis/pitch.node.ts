import { Params } from '../../params'
import type { DspNode, NodeDefinition, ParamSpec, ProcessContext } from '../../types'
import { estimatePitch } from './yin'

/** The rate the analysis runs at: high enough for a kHz fundamental, low enough to be cheap (the input is averaged down to it). */
const TARGET_RATE = 12000
/** How much sound is looked at, in analysis samples (about 85 ms: enough for two periods of 50 Hz), and how often it is looked at. */
const WINDOW = 1024
const HOP = 256

const PARAMS: readonly ParamSpec[] = [
  { id: 'low', label: 'Lowest', min: 30, max: 500, default: 60, unit: 'Hz' },
  { id: 'high', label: 'Highest', min: 200, max: 3000, default: 1200, unit: 'Hz' },
  { id: 'threshold', label: 'Confidence', min: 0, max: 1, default: 0.6, step: 0.01 },
]

/**
 * Finds the pitch of a sound: its frequency in Hz and how sure it is. The frequency holds the last pitch it was sure about, so a
 * pause or a noisy moment does not make it jump to 0; it is 0 until the first one. It lags the sound by roughly 50 ms.
 */
class PitchDetector implements DspNode {
  private readonly params = new Params(PARAMS)
  private readonly ring = new Float32Array(WINDOW)
  private readonly frame = new Float32Array(WINDOW)
  private write = 0
  private filled = 0
  private sinceAnalysis = 0
  private sum = 0
  private summed = 0
  private frequency = 0
  private confidence = 0

  setParam(id: string, value: number): void {
    this.params.set(id, value)
  }

  private analyse(rate: number): void {
    // Unwrap the ring so the oldest sample comes first.
    for (let i = 0; i < WINDOW; i++) this.frame[i] = this.ring[(this.write + i) % WINDOW] ?? 0
    const estimate = estimatePitch(this.frame, rate, this.params.get('low'), this.params.get('high'))
    this.confidence = estimate.confidence
    if (estimate.frequency > 0 && estimate.confidence >= this.params.get('threshold')) this.frequency = estimate.frequency
  }

  process({ frames, sampleRate }: ProcessContext, [input]: ReadonlyArray<Float32Array | null>, [frequency, confidence]: readonly Float32Array[]): void {
    const factor = Math.max(1, Math.round(sampleRate / TARGET_RATE))
    const rate = sampleRate / factor
    for (let i = 0; i < frames; i++) {
      this.sum += input?.[i] ?? 0
      this.summed++
      if (this.summed === factor) {
        this.ring[this.write] = this.sum / factor
        this.write = (this.write + 1) % WINDOW
        this.filled = Math.min(WINDOW, this.filled + 1)
        this.sum = 0
        this.summed = 0
        if (this.filled === WINDOW && ++this.sinceAnalysis >= HOP) {
          this.sinceAnalysis = 0
          this.analyse(rate)
        }
      }
      if (frequency) frequency[i] = this.frequency
      if (confidence) confidence[i] = this.confidence
    }
  }
}

export const pitchNode: NodeDefinition = {
  type: 'pitch',
  label: 'Pitch detector',
  inputs: [{ id: 'in', label: 'In' }],
  outputs: [
    { id: 'frequency', label: 'Freq', kind: 'control' },
    { id: 'confidence', label: 'Sure', kind: 'control' },
  ],
  params: PARAMS,
  create: () => new PitchDetector(),
}
