import type { ControlTarget } from '../control'
import type { Patch } from '../patch'
import type { ParamSpec } from '../dsp'

export interface AutomationPoint {
  readonly id: string
  /** Beats in the closed interval [0, clip length]; the endpoint is approached before wrap. */
  readonly beat: number
  readonly value: number
  /** Interpolation from this point to the next. */
  readonly interpolation: 'linear' | 'hold'
}
export interface AutomationLane {
  readonly id: string
  readonly target: ControlTarget
  readonly enabled: boolean
  readonly points: readonly AutomationPoint[]
}
export const MAX_AUTOMATION_LANES = 64
export const MAX_AUTOMATION_POINTS = 2048
export interface PlaybackLane extends AutomationLane {
  readonly spec: ParamSpec
  readonly baseValue: number
  readonly discrete: boolean
}
export interface AutomationClip {
  readonly id: string
  readonly lengthBeats: number
  readonly lanes: readonly PlaybackLane[]
}
export interface AutomationTrack {
  readonly trackId: string
  /** Dedicated return/master queue, independent of note/audio launchers. */
  readonly slotOwner?: import('../control').ControlOwner
  readonly noteGraph?: Patch
  readonly clips: readonly (AutomationClip | null)[]
}
/** A region's own lanes on the timeline: they play from `start` to `end`, the phase wrapping by `length`. */
export interface TimelineRegionLanes {
  readonly trackId: string
  readonly start: number
  /** The region's end, or its loop end when it loops. */
  readonly end: number
  readonly length: number
  readonly lanes: readonly PlaybackLane[]
}
/** What plays while the arrangement plays: each owner's timeline lanes, in song beats, and the regions' own lanes. */
export interface TimelineAutomation {
  readonly owners: readonly { readonly owner: import('../control').ControlOwner; readonly lanes: readonly PlaybackLane[] }[]
  readonly regions: readonly TimelineRegionLanes[]
  /** The flattened note graph of each instrument track a timeline or region lane addresses in domain `notes`. */
  readonly noteGraphs?: Readonly<Record<string, Patch>>
}
