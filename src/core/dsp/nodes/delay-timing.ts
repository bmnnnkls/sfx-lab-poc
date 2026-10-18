import type { ParamSpec } from '../types'
import { tempoOf } from '../types'

/** Fixed capacity per channel, independent of BPM. 1,536,008 bytes/channel at 48 kHz. */
export const MAX_DELAY_SECONDS = 8
export const DELAY_CROSSFADE_SECONDS = 0.02

/** Persisted enum indices: append only, never reorder. A quarter note is one beat.
 * Dotted multiplies by 3/2; triplet by 2/3. */
export const DELAY_DIVISIONS = [
  { label: 'Time in beats', beats: 0 },
  ...[1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8, 16].flatMap((beats, index) => {
    const label = ['1/32', '1/16', '1/8', '1/4', '1/2', '1 bar', '2 bars', '4 bars'][index]!
    return [{ label, beats }, { label: `${label} dotted`, beats: beats * 1.5 }, { label: `${label} triplet`, beats: beats * 2 / 3 }]
  }),
] as const
export const delayDivisionParam: ParamSpec = { id: 'division', label: 'Beat division', min: 0, max: DELAY_DIVISIONS.length - 1, default: 0, step: 1, options: DELAY_DIVISIONS.map(d => d.label) }

const divisionOf = (values: Readonly<Record<string, number>>) => DELAY_DIVISIONS[Math.round(values.division ?? 0)] ?? DELAY_DIVISIONS[0]
const timeOf = (values: Readonly<Record<string, number>>) => Number.isFinite(values.time) ? Math.min(2, Math.max(0.001, values.time!)) : 0.3
const synced = (values: Readonly<Record<string, number>>) => Math.round(values.sync ?? 0) === 1
const requestedSeconds = (values: Readonly<Record<string, number>>, context: { readonly tempo?: number }) => synced(values) ? (divisionOf(values).beats || timeOf(values)) * 60 / tempoOf(context) : timeOf(values)

/** Allocation-free render path; line capacity is shared with the UI resolver below. */
export const delaySeconds = (values: Readonly<Record<string, number>>, context: { readonly tempo?: number }): number => Math.min(MAX_DELAY_SECONDS, requestedSeconds(values, context))

/** Missing division preserves the original numeric-beat mode and every seconds value. */
export const delayTiming = (values: Readonly<Record<string, number>>, context: { readonly tempo?: number }) => {
  const requested = requestedSeconds(values, context)
  return {
    seconds: Math.min(MAX_DELAY_SECONDS, requested), requested, capped: requested > MAX_DELAY_SECONDS,
    label: synced(values) ? (divisionOf(values).beats ? divisionOf(values).label : `${timeOf(values)} beats`) : `${timeOf(values)} s`,
  }
}

/** Two stationary read heads: no tape pitch glide, no buffer reset or render-time allocation.
 * Changes arriving during a fade coalesce to the newest target after that fade finishes. */
export class DelayTap {
  private current = 0
  private next = 0
  private position = 0
  private readonly length: number
  constructor(sampleRate: number) { this.length = Math.max(1, Math.round(sampleRate * DELAY_CROSSFADE_SECONDS)) }
  prepare(samples: number): void {
    if (this.current === 0) this.current = this.next = samples
    if (this.position === 0 && samples !== this.current) { this.next = samples; this.position = 1 }
  }
  read(line: Float32Array, write: number): number {
    const old = this.at(line, write, this.current)
    if (!this.position) return old
    const weight = (this.position - 1) / this.length
    return old * (1 - weight) + this.at(line, write, this.next) * weight
  }
  private at(line: Float32Array, write: number, delay: number): number {
    const position = (write - delay + line.length) % line.length
    const index = Math.floor(position), fraction = position - index
    return line[index]! * (1 - fraction) + line[(index + 1) % line.length]! * fraction
  }
  advance(): void {
    if (this.position && ++this.position > this.length) { this.current = this.next; this.position = 0 }
  }
}
