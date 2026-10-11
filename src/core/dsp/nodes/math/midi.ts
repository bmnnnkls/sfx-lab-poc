import { mathNode } from './math-node'

const TUNING = { id: 'tuning', label: 'Tuning (A4)', min: 400, max: 480, default: 440, unit: 'Hz', step: 0.01 }
const A4 = 69

/** Keeps the exponent finite: far outside any instrument, so no musical value is touched. */
const MIN_NOTE = -120
const MAX_NOTE = 260

export const midiToHzNode = mathNode({
  type: 'midiToHz',
  label: 'MIDI to Hz',
  operands: [{ id: 'note', label: 'Note', default: A4 }],
  extra: [TUNING],
  // Fractional notes work: 60.5 is a quarter tone above middle C.
  make: (params) => (note) => params.get('tuning') * 2 ** ((Math.min(MAX_NOTE, Math.max(MIN_NOTE, note)) - A4) / 12),
})

export const hzToMidiNode = mathNode({
  type: 'hzToMidi',
  label: 'Hz to MIDI',
  operands: [{ id: 'hz', label: 'Hz', default: 440 }],
  extra: [TUNING],
  // Zero and below (and anything under note 0) give note 0, the lowest, rather than -Infinity or NaN.
  make: (params) => {
    const lowest = (tuning: number) => tuning * 2 ** (-A4 / 12)
    return (hz) => {
      const tuning = params.get('tuning')
      return A4 + 12 * Math.log2(Math.max(hz, lowest(tuning)) / tuning)
    }
  },
})
