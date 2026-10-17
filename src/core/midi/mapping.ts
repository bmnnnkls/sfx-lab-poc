import type { ControlTarget } from '../control'

/** Portable selector; the browser resolves deviceId locally. No live port is saved. */
export interface MidiMapping {
  readonly id: string
  readonly deviceId: string
  readonly deviceName: string
  /** Zero-based, like engine commands. */
  readonly channel: number
  readonly cc: number
  readonly target: ControlTarget
  readonly pickup: boolean
}
export const isLearnableCC = (cc: number): boolean => Number.isInteger(cc) && cc >= 0 && cc < 120 && cc !== 64
export const midiSourceKey = (source: Pick<MidiMapping, 'deviceId' | 'channel' | 'cc'>): string => JSON.stringify([source.deviceId, source.channel, source.cc])
