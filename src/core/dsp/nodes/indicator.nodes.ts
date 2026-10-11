import { Params } from '../params'
import type { DspNode, NodeDefinition, ParamSpec, PortSpec, ProcessContext } from '../types'

/** Wide bounds: an indicator may show a frequency, a decibel level or a note number alike. */
const BOUND = 100000

/**
 * An indicator is a sink that only remembers the latest value it saw; the engine reads it with `readout()` and reports it to the
 * screen (`EngineStatus.readouts`). It has no outputs and does nothing to the sound. The value is the last sample of the block, so a
 * control (constant over a block) shows exactly, and a moving signal shows where it is now.
 */
class Indicator implements DspNode {
  protected readonly params: Params
  private latest = 0

  constructor(specs: readonly ParamSpec[]) {
    this.params = new Params(specs)
  }

  setParam(id: string, value: number): void {
    this.params.set(id, value)
  }

  readout(): number {
    return this.latest
  }

  process({ frames }: ProcessContext, [input]: ReadonlyArray<Float32Array | null>): void {
    const value = frames > 0 ? (input?.[frames - 1] ?? 0) : this.latest
    this.latest = Number.isFinite(value) ? value : 0
  }
}

const IN: readonly PortSpec[] = [{ id: 'in', label: 'In', kind: 'control' }]

export const LED_MODES = ['on/off', 'brightness'] as const
export const LED_COLOURS = ['green', 'red', 'amber', 'blue'] as const

const LED_PARAMS: readonly ParamSpec[] = [
  { id: 'mode', label: 'Mode', min: 0, max: LED_MODES.length - 1, default: 0, step: 1, options: LED_MODES },
  { id: 'threshold', label: 'Threshold', min: -BOUND, max: BOUND, default: 0.5 },
  { id: 'low', label: 'Dark at', min: -BOUND, max: BOUND, default: 0 },
  { id: 'high', label: 'Bright at', min: -BOUND, max: BOUND, default: 1 },
  { id: 'colour', label: 'Colour', min: 0, max: LED_COLOURS.length - 1, default: 0, step: 1, options: LED_COLOURS },
]

export const ledNode: NodeDefinition = {
  type: 'led',
  label: 'LED',
  inputs: IN,
  outputs: [],
  params: LED_PARAMS,
  global: true,
  indicator: true,
  panelKind: 'led',
  paramSockets: false,
  create: () => new Indicator(LED_PARAMS),
}

export const DISPLAY_STYLES = ['number', 'note name'] as const

const DISPLAY_PARAMS: readonly ParamSpec[] = [
  { id: 'decimals', label: 'Decimals', min: 0, max: 6, default: 2, step: 1 },
  { id: 'style', label: 'Style', min: 0, max: DISPLAY_STYLES.length - 1, default: 0, step: 1, options: DISPLAY_STYLES },
]

export const displayNode: NodeDefinition = {
  type: 'display',
  label: 'Number display',
  inputs: IN,
  outputs: [],
  params: DISPLAY_PARAMS,
  global: true,
  indicator: true,
  panelKind: 'display',
  paramSockets: false,
  create: () => new Indicator(DISPLAY_PARAMS),
}

const BAR_PARAMS: readonly ParamSpec[] = [
  { id: 'min', label: 'Empty at', min: -BOUND, max: BOUND, default: 0 },
  { id: 'max', label: 'Full at', min: -BOUND, max: BOUND, default: 1 },
]

export const barNode: NodeDefinition = {
  type: 'bar',
  label: 'Bar meter',
  inputs: IN,
  outputs: [],
  params: BAR_PARAMS,
  global: true,
  indicator: true,
  panelKind: 'bar',
  paramSockets: false,
  create: () => new Indicator(BAR_PARAMS),
}
