import { Params } from '../params'
import type { DspNode, NodeDefinition, ParamSpec, ProcessContext } from '../types'

export const MIDI_CC_TYPE = 'midiCC'

const PARAMS: readonly ParamSpec[] = [
  // CC 0 to 119: 120 to 127 are channel mode messages. 64 (the sustain pedal) is allowed but stays 0, since the pedal is
  // folded into notes.
  { id: 'cc', label: 'CC', min: 0, max: 119, default: 1, step: 1, format: 'midiCC', socket: false },
]

/**
 * The value of one MIDI CC on this instrument track, 0 to 1, constant over the block: the mod wheel, a breath controller,
 * a knob that no mapping takes. 0 outside an instrument's patch, where there is no track expression.
 */
class MidiCC implements DspNode {
  private readonly params = new Params(PARAMS)

  setParam(id: string, value: number): void {
    this.params.set(id, value)
  }

  process({ frames, expression }: ProcessContext, _inputs: ReadonlyArray<Float32Array | null>, [out]: readonly Float32Array[]): void {
    out?.fill(expression?.cc[Math.round(this.params.get('cc'))] ?? 0, 0, frames)
  }
}

export const midiCCNode: NodeDefinition = {
  type: MIDI_CC_TYPE,
  label: 'MIDI CC',
  inputs: [],
  outputs: [{ id: 'value', label: 'Value', kind: 'control' }],
  params: PARAMS,
  global: true,
  paramSockets: false,
  create: () => new MidiCC(),
}
