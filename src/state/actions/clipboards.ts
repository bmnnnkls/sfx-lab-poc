import type { AudioClip, AutomationSlot, Clip, CopiedNodes, TrackGraph } from '@core'
import { createClipboard } from '../clipboard'

/** A copied clip value and the kind of track it came from; no ids, so it still pastes after its track is gone. */
export interface CopiedClip {
  readonly clip: Clip | AudioClip
  readonly kind: 'instrument' | 'audio'
}

/** Session clips and arrangement regions share one clipboard: a region's content is a clip. */
export const clipClipboard = createClipboard<CopiedClip | null>(null)

/** A copied automation slot of the master or a return. */
export const automationSlotClipboard = createClipboard<AutomationSlot | null>(null)

/** Copied nodes and the wires between them, with the kind of graph they came from: an instrument, effects or notes. */
export interface CopiedGraphNodes {
  readonly graph: TrackGraph
  readonly copied: CopiedNodes
}

export const nodeClipboard = createClipboard<CopiedGraphNodes | null>(null)
