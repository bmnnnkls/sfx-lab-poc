import { mathNode } from './math-node'

/**
 * Takes a value of `in` each time `trigger` rises through 0.5 and holds it until the next: a stepped random control from
 * noise, or a note's pitch held after it ends. Until the first trigger it holds the first value it saw.
 */
export const sampleHoldNode = mathNode({
  type: 'sampleHold',
  label: 'Sample and hold',
  operands: [
    { id: 'in', label: 'In', default: 0 },
    { id: 'trigger', label: 'Trigger', default: 0 },
  ],
  make: () => {
    let held = 0
    let primed = false
    let high = false
    return (value, trigger) => {
      const now = trigger > 0.5
      if (!primed || (now && !high)) {
        held = value
        primed = true
      }
      high = now
      return held
    }
  },
})
