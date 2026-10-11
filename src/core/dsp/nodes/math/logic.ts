import { mathNode } from './math-node'

/** A signal counts as high at or above this: the same threshold every trigger and gate in the app uses. */
const HIGH = 0.5

/** The longest a control can be delayed, in seconds (the buffer is made for this much). */
export const MAX_CONTROL_DELAY = 2

/**
 * Two levels with a gap between them: the output goes to 1 when the input reaches High and back to 0 only when it falls to Low,
 * so a wobbling input near one threshold does not chatter. Turns any signal into a clean gate.
 */
export const schmittNode = mathNode({
  type: 'schmitt',
  label: 'Schmitt trigger',
  inNotes: false,
  operands: [
    { id: 'in', label: 'In', default: 0 },
    { id: 'high', label: 'High', default: 0.6 },
    { id: 'low', label: 'Low', default: 0.4 },
  ],
  make: () => {
    let on = false
    return (value, high, low) => {
      // Given the wrong way round the two still mean "the upper" and "the lower".
      const upper = Math.max(high, low)
      const lower = Math.min(high, low)
      if (value >= upper) on = true
      else if (value <= lower) on = false
      return on ? 1 : 0
    }
  },
})

const EDGE_MODES = ['rising', 'falling', 'both'] as const

/** A short pulse each time the input crosses 0.5. The first sample it sees is not an edge, so nothing fires at the start. */
export const edgeNode = mathNode({
  type: 'edge',
  label: 'Edge detect',
  inNotes: false,
  operands: [{ id: 'in', label: 'In', default: 0 }],
  extra: [
    { id: 'mode', label: 'Edge', min: 0, max: EDGE_MODES.length - 1, default: 0, step: 1, options: EDGE_MODES },
    { id: 'pulse', label: 'Pulse', min: 0.0001, max: 1, default: 0.005, unit: 's' },
  ],
  make: (params, sampleRate) => {
    let high: boolean | undefined
    let left = 0
    return (value) => {
      const now = value >= HIGH
      if (high !== undefined && now !== high) {
        const mode = EDGE_MODES[Math.round(params.get('mode'))]
        if (mode === 'both' || (mode === 'rising' && now) || (mode === 'falling' && !now)) {
          left = Math.max(1, Math.round(params.get('pulse') * sampleRate))
        }
      }
      high = now
      if (left > 0) {
        left--
        return 1
      }
      return 0
    }
  },
})

/** Flips between 0 and 1 on every rise of Trigger; a rise of Reset sets it back to 0. A push button into this is a toggle you can wire anywhere. */
export const flipFlopNode = mathNode({
  type: 'flipFlop',
  label: 'Flip-flop',
  inNotes: false,
  operands: [
    { id: 'trigger', label: 'Trigger', default: 0 },
    { id: 'reset', label: 'Reset', default: 0 },
  ],
  make: () => {
    let on = false
    let triggerHigh = false
    let resetHigh = false
    return (trigger, reset) => {
      const [t, r] = [trigger >= HIGH, reset >= HIGH]
      if (r && !resetHigh) on = false
      else if (t && !triggerHigh) on = !on
      triggerHigh = t
      resetHigh = r
      return on ? 1 : 0
    }
  },
})

/** Counts the rises of Trigger (0, 1, 2, ...), wrapping to 0 at Limit (0 for no limit); a rise of Reset goes back to 0. */
export const counterNode = mathNode({
  type: 'counter',
  label: 'Counter',
  inNotes: false,
  operands: [
    { id: 'trigger', label: 'Trigger', default: 0 },
    { id: 'reset', label: 'Reset', default: 0 },
  ],
  extra: [{ id: 'limit', label: 'Limit', min: 0, max: 1000, default: 0, step: 1 }],
  make: (params) => {
    let count = 0
    let triggerHigh = false
    let resetHigh = false
    return (trigger, reset) => {
      const [t, r] = [trigger >= HIGH, reset >= HIGH]
      if (r && !resetHigh) count = 0
      else if (t && !triggerHigh) {
        const limit = Math.round(params.get('limit'))
        count = limit > 0 ? (count + 1) % limit : count + 1
      }
      triggerHigh = t
      resetHigh = r
      return count
    }
  },
})

const CLOCK_UNITS = ['Hz', 'BPM'] as const

/** A steady on/off square: Rate times a second (or a minute), high for Width of each cycle. A rise of Reset restarts the cycle. */
export const clockNode = mathNode({
  type: 'clock',
  label: 'Clock',
  inNotes: false,
  operands: [{ id: 'reset', label: 'Reset', default: 0 }],
  extra: [
    { id: 'rate', label: 'Rate', min: 0.01, max: 2000, default: 2 },
    { id: 'unit', label: 'Per', min: 0, max: CLOCK_UNITS.length - 1, default: 0, step: 1, options: CLOCK_UNITS },
    { id: 'width', label: 'Width', min: 0.01, max: 0.99, default: 0.5, step: 0.01 },
  ],
  make: (params, sampleRate) => {
    let phase = 0
    let resetHigh = false
    return (reset) => {
      const now = reset >= HIGH
      if (now && !resetHigh) phase = 0
      resetHigh = now
      const out = phase < params.get('width') ? 1 : 0
      const perSecond = params.get('rate') / (Math.round(params.get('unit')) === 1 ? 60 : 1)
      phase += perSecond / sampleRate
      if (phase >= 1) phase -= Math.floor(phase)
      return out
    }
  },
})

/** Lets through every Nth cycle of a clock (its first, then each Nth after): half-time, a bar marker, a rhythm from a steady beat. */
export const dividerNode = mathNode({
  type: 'divider',
  label: 'Clock divider',
  inNotes: false,
  operands: [
    { id: 'in', label: 'In', default: 0 },
    { id: 'reset', label: 'Reset', default: 0 },
  ],
  extra: [{ id: 'by', label: 'Divide by', min: 1, max: 64, default: 2, step: 1 }],
  make: (params) => {
    let count = -1
    let inHigh = false
    let resetHigh = false
    let open = false
    return (input, reset) => {
      const [i, r] = [input >= HIGH, reset >= HIGH]
      if (r && !resetHigh) count = -1
      if (i && !inHigh) {
        count = (count + 1) % Math.max(1, Math.round(params.get('by')))
        open = count === 0
      }
      inHigh = i
      resetHigh = r
      return i && open ? 1 : 0
    }
  },
})

/** The input, a little later: Time seconds ago. It starts as the first value it sees, so there is no jump up from zero. */
export const controlDelayNode = mathNode({
  type: 'controlDelay',
  label: 'Control delay',
  inNotes: false,
  operands: [{ id: 'in', label: 'In', default: 0 }],
  extra: [{ id: 'time', label: 'Time', min: 0, max: MAX_CONTROL_DELAY, default: 0.1, unit: 's' }],
  make: (params, sampleRate) => {
    const size = Math.ceil(MAX_CONTROL_DELAY * sampleRate) + 2
    const history = new Float32Array(size)
    let write = 0
    let primed = false
    return (value) => {
      if (!primed) {
        history.fill(value)
        primed = true
      }
      history[write] = value
      const back = Math.min(size - 1, Math.max(0, Math.round(params.get('time') * sampleRate)))
      const out = history[(write - back + size) % size] ?? 0
      write = (write + 1) % size
      return out
    }
  },
})
