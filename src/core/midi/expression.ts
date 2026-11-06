import type { TrackExpression } from '../dsp'
import { midiToFrequency } from '../shared'

/**
 * What a keyboard plays besides notes, kept per instrument track: the pitch wheel (−1 to 1), channel pressure (0 to 1)
 * and the CCs no mapping takes (0 to 1). Each is 0 at rest.
 */
export type ExpressionControl = 'pitchBend' | 'pressure' | { readonly cc: number }

/** CCs 0 to 119 can be expression; 120 to 127 are channel mode messages. */
export const EXPRESSION_CC_COUNT = 120
/** The sustain pedal is folded into notes, never expression. */
export const SUSTAIN_CC = 64
export const isExpressionCC = (cc: number): boolean => Number.isInteger(cc) && cc >= 0 && cc < EXPRESSION_CC_COUNT && cc !== SUSTAIN_CC
/** Every control's value at rest: the wheel centred, no pressure, a CC at 0. */
export const EXPRESSION_REST = 0

/**
 * The source an expression lane writes as: no keyboard has it, so a keyboard's release never puts a lane's value back
 * at rest (the lane's own end does).
 */
export const LANE_SOURCE = 'lane'

export const expressionKey = (control: ExpressionControl): string => (typeof control === 'string' ? control : `cc:${control.cc}`)

export const isExpressionControl = (control: unknown): control is ExpressionControl =>
  control === 'pitchBend' || control === 'pressure' ||
  (typeof control === 'object' && control !== null && isExpressionCC((control as { cc?: unknown }).cc as number))

/** The range of each control's value. */
export const expressionRange = (control: ExpressionControl): { readonly min: number; readonly max: number } =>
  control === 'pitchBend' ? { min: -1, max: 1 } : { min: 0, max: 1 }

/** The pitch wheel's reach either way, in semitones, per instrument track. */
export const BEND_RANGE = { min: 0, max: 24, default: 2 } as const

/** A bend range as saved and used: a whole number of semitones, 0 to 24; anything else is the default. */
export const clampBendRange = (range: number): number =>
  Number.isFinite(range) ? Math.min(BEND_RANGE.max, Math.max(BEND_RANGE.min, Math.round(range))) : BEND_RANGE.default

/** A note's frequency with the wheel at `bend` (−1 to 1) and a reach of `range` semitones. */
export const bentFrequency = (pitch: number, bend: number, range: number): number =>
  bend === 0 || range === 0 ? midiToFrequency(pitch) : midiToFrequency(pitch + bend * range)

/** A track's expression with everything at rest. */
export const createTrackExpression = (bendRange: number = BEND_RANGE.default): TrackExpression =>
  ({ bend: EXPRESSION_REST, bendRange: clampBendRange(bendRange), pressure: EXPRESSION_REST, cc: new Float32Array(EXPRESSION_CC_COUNT) })

/** Puts every control back at rest, keeping the bend range. */
export const restTrackExpression = (expression: TrackExpression): void => {
  expression.bend = EXPRESSION_REST
  expression.pressure = EXPRESSION_REST
  expression.cc.fill(EXPRESSION_REST)
}

/** The common names of controllers, as keyboards and DAWs show them. */
export const CC_NAMES: Readonly<Record<number, string>> = {
  0: 'Bank select', 1: 'Mod wheel', 2: 'Breath', 4: 'Foot', 5: 'Portamento time', 7: 'Volume', 8: 'Balance', 10: 'Pan',
  11: 'Expression', 12: 'Effect 1', 13: 'Effect 2', 65: 'Portamento', 66: 'Sostenuto', 67: 'Soft pedal', 68: 'Legato',
  71: 'Resonance', 72: 'Release', 73: 'Attack', 74: 'Brightness', 91: 'Reverb', 93: 'Chorus',
}

/** "1 Mod wheel", or the bare number when the CC has no common name. */
export const ccLabel = (cc: number): string => (CC_NAMES[cc] ? `${cc} ${CC_NAMES[cc]}` : String(cc))

/**
 * Polyphonic pressure folded into channel pressure, for one input and channel: the pressure is the highest of the
 * channel's and those of the keys held. A key's pressure goes when the key comes up.
 */
export class PressureFold {
  private channel = 0
  private readonly keys = new Map<number, number>()

  /** Channel pressure; returns the folded value. */
  set(value: number): number {
    this.channel = value
    return this.value()
  }

  /** One key's pressure; returns the folded value. */
  key(note: number, value: number): number {
    if (value > 0) this.keys.set(note, value)
    else this.keys.delete(note)
    return this.value()
  }

  /** The key came up; returns the folded value, or undefined when the key had no pressure (nothing changed). */
  keyUp(note: number): number | undefined {
    return this.keys.delete(note) ? this.value() : undefined
  }

  value(): number {
    let highest = this.channel
    for (const value of this.keys.values()) if (value > highest) highest = value
    return highest
  }
}
