import { mathNode } from './math-node'

/** A unit conversion of one value: the node, its single operand and the rule. */
const convert = (type: string, label: string, operand: { id: string; label: string; default: number }, rule: (value: number) => number) =>
  mathNode({ type, label, operands: [operand], pure: true, make: () => rule })

/** Beyond these a ratio or a gain is not a musical number, and 2 ** x would overflow. */
const MAX_SEMITONES = 1200
/** A gain of 1e-6 is -120 dB: the floor, so silence is a number and not -Infinity. */
const MIN_GAIN = 1e-6

export const semitonesToRatioNode = convert('semitonesToRatio', 'Semitones to ratio', { id: 'st', label: 'Semitones', default: 0 }, (st) =>
  2 ** (Math.min(MAX_SEMITONES, Math.max(-MAX_SEMITONES, st)) / 12),
)

export const ratioToSemitonesNode = convert('ratioToSemitones', 'Ratio to semitones', { id: 'ratio', label: 'Ratio', default: 1 }, (ratio) =>
  12 * Math.log2(Math.max(MIN_GAIN, ratio)),
)

export const dbToGainNode = convert('dbToGain', 'dB to gain', { id: 'db', label: 'dB', default: 0 }, (db) =>
  10 ** (Math.min(400, Math.max(-400, db)) / 20),
)

export const gainToDbNode = convert('gainToDb', 'Gain to dB', { id: 'gain', label: 'Gain', default: 1 }, (gain) =>
  20 * Math.log10(Math.max(MIN_GAIN, gain)),
)

/** Zero or less has no period: it gives 0 rather than Infinity. */
export const hzToMsNode = convert('hzToMs', 'Hz to ms', { id: 'hz', label: 'Hz', default: 1 }, (hz) => (hz > 0 ? 1000 / hz : 0))

export const msToHzNode = convert('msToHz', 'ms to Hz', { id: 'ms', label: 'ms', default: 1000 }, (ms) => (ms > 0 ? 1000 / ms : 0))
