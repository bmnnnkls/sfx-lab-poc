import { mathNode } from './math-node'

/** Below this the signal passes untouched: a time constant shorter than a sample is no smoothing. */
const MIN_TIME = 1e-5

export const smoothNode = mathNode({
  type: 'smooth',
  label: 'Smooth',
  operands: [{ id: 'in', label: 'In', default: 0 }],
  extra: [
    { id: 'mode', label: 'Mode', min: 0, max: 1, default: 0, step: 1, options: ['smooth', 'slew'] },
    { id: 'time', label: 'Time', min: 0, max: 20, default: 0.05, unit: 's' },
    { id: 'rate', label: 'Rate', min: 0, max: 100000, default: 1, unit: '/s' },
  ],
  // `smooth` is a one-pole lowpass with the given time constant; `slew` moves at most `rate` units per second.
  // The first sample is taken as it is, so a node does not glide up from zero when it starts.
  make: (params, sampleRate) => {
    let y = 0
    let primed = false
    return (a) => {
      if (!primed) {
        primed = true
        y = a
        return y
      }
      if (Math.round(params.get('mode')) === 1) {
        const limit = params.get('rate') / sampleRate
        y += Math.min(limit, Math.max(-limit, a - y))
      } else {
        const time = params.get('time')
        y = time < MIN_TIME ? a : y + (a - y) * (1 - Math.exp(-1 / (time * sampleRate)))
      }
      return y
    }
  },
})
