import { Params } from '../params'
import type { DspNode, NodeDefinition, ParamSpec, ProcessContext } from '../types'

const MODES = ['toggle', 'momentary', 'trigger'] as const
const TRIGGER = 2

/** Wide bounds: the two values a switch outputs can be anything (a frequency, a gain, a note). */
const BOUND = 100000

const PARAMS: readonly ParamSpec[] = [
  // The state is the panel's to flip (and a pulse is made from its rising edge), so it has no socket of its own.
  { id: 'on', label: 'On', min: 0, max: 1, default: 0, step: 1, socket: false },
  // How the panel treats a press: a toggle stays where it is put, a momentary switch is on only while held, a trigger
  // (a push button) is held on the panel like a momentary one but outputs a short pulse, whatever the length of the press.
  { id: 'mode', label: 'Mode', min: 0, max: MODES.length - 1, default: 0, step: 1, options: MODES },
  { id: 'offValue', label: 'Off value', min: -BOUND, max: BOUND, default: 0 },
  { id: 'onValue', label: 'On value', min: -BOUND, max: BOUND, default: 1 },
  { id: 'pulse', label: 'Pulse', min: 0.001, max: 2, default: 0.05, unit: 's' },
]

/**
 * A switch as a node: outputs its off value while it is off and its on value while it is on (0 and 1 until set). As a
 * trigger it outputs the on value for `pulse` seconds from each press and the off value otherwise. The pulse starts on the
 * rising edge of the state, seen as the state is set, so a press shorter than a block is not lost.
 */
class Switch implements DspNode {
  private readonly params = new Params(PARAMS)
  private pulseLeft = 0

  constructor(private readonly sampleRate: number) {}

  setParam(id: string, value: number): void {
    if (id === 'on' && value >= 0.5 && this.params.get('on') < 0.5) this.pulseLeft = Math.max(1, Math.round(this.params.get('pulse') * this.sampleRate))
    this.params.set(id, value)
  }

  process({ frames }: ProcessContext, _inputs: ReadonlyArray<Float32Array | null>, [out]: readonly Float32Array[]): void {
    if (!out) return
    const off = this.params.get('offValue')
    const on = this.params.get('onValue')
    if (Math.round(this.params.get('mode')) === TRIGGER) {
      const high = Math.min(frames, this.pulseLeft)
      out.fill(on, 0, high)
      out.fill(off, high, frames)
      this.pulseLeft -= high
    } else {
      out.fill(this.params.get('on') >= 0.5 ? on : off, 0, frames)
    }
  }
}

export const switchNode: NodeDefinition = {
  type: 'switch',
  label: 'Switch',
  inputs: [],
  outputs: [{ id: 'out', label: 'Out', kind: 'control' }],
  params: PARAMS,
  global: true,
  inNotes: true,
  panelKind: 'switch',
  create: (sampleRate) => new Switch(sampleRate),
}
