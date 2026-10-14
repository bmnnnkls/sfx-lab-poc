import { Params } from '../params'
import type { DspNode, NodeDefinition, ParamSpec, ProcessContext } from '../types'

/** The lowest pitch the comb can ring at; its delay line is made for this. */
const MIN_FREQUENCY = 20
const MAX_FREQUENCY = 8000
const FOLLOWS = ['note', 'fixed'] as const

const PARAMS: readonly ParamSpec[] = [
  { id: 'follow', label: 'Tune to', min: 0, max: FOLLOWS.length - 1, default: 0, step: 1, options: FOLLOWS },
  { id: 'pitch', label: 'Pitch', min: -36, max: 36, default: 0, step: 0.01, unit: 'st' },
  { id: 'frequency', label: 'Freq', min: MIN_FREQUENCY, max: MAX_FREQUENCY, default: 220, unit: 'Hz' },
  { id: 'feedback', label: 'Feedback', min: -0.995, max: 0.995, default: 0.9, step: 0.001 },
  { id: 'damping', label: 'Damp', min: 0, max: 0.99, default: 0.2, step: 0.01 },
  { id: 'mix', label: 'Mix', min: 0, max: 1, default: 1 },
]

/**
 * A feedback comb tuned to a pitch: the sound comes back after one period of the note, again and again, so it rings at the
 * note and its harmonics (a short noise burst through it is a plucked string, a drum through it a metallic resonance). Its
 * delay is 1 / frequency, the note's pitch shifted by Pitch semitones (Tune to `note`, in a voice), or Freq (`fixed`, or where
 * there is no note: a shared or insert stage). Negative feedback rings an octave lower with only the odd harmonics, hollow
 * like a clarinet. Damp darkens each round trip, so the highs die first, like a real string.
 */
class Comb implements DspNode {
  private readonly params = new Params(PARAMS)
  private readonly line: Float32Array
  private writeIndex = 0
  /** The one-pole lowpass inside the loop. */
  private low = 0

  constructor(sampleRate: number) {
    this.line = new Float32Array(Math.ceil(sampleRate / MIN_FREQUENCY) + 2)
  }

  setParam(id: string, value: number): void {
    this.params.set(id, value)
  }

  process({ frames, sampleRate, note }: ProcessContext, [input]: ReadonlyArray<Float32Array | null>, [out]: readonly Float32Array[]): void {
    if (!out) return
    const size = this.line.length
    const followsNote = Math.round(this.params.get('follow')) === 0 && note.frequency > 0
    const base = followsNote ? note.frequency * 2 ** (this.params.get('pitch') / 12) : this.params.get('frequency')
    const frequency = Math.min(MAX_FREQUENCY, Math.max(MIN_FREQUENCY, base))
    const period = Math.min(size - 2, sampleRate / frequency)
    const feedback = this.params.get('feedback')
    const damping = this.params.get('damping')
    const mix = this.params.get('mix')

    for (let i = 0; i < frames; i++) {
      const readPosition = (this.writeIndex - period + size) % size
      const index = Math.floor(readPosition)
      const fraction = readPosition - index
      const delayed = (this.line[index] ?? 0) * (1 - fraction) + (this.line[(index + 1) % size] ?? 0) * fraction
      this.low = delayed * (1 - damping) + this.low * damping
      const x = input?.[i] ?? 0
      const y = x + this.low * feedback
      this.line[this.writeIndex] = y
      this.writeIndex = (this.writeIndex + 1) % size
      out[i] = x * (1 - mix) + y * mix
    }
  }
}

export const combNode: NodeDefinition = {
  type: 'comb',
  label: 'Comb',
  inputs: [{ id: 'in', label: 'In' }],
  outputs: [{ id: 'out', label: 'Out' }],
  params: PARAMS,
  stereoCapable: true,
  create: (sampleRate) => new Comb(sampleRate),
}
