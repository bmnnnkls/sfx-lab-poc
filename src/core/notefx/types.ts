import type { ParamSpec, PortSpec } from '../dsp'
import type { NoteEvent } from '../session'

/**
 * The running side of one note node: turns the note events of a beat range [from, to) into the events that
 * come out of it. Ranges are contiguous across calls, so a node may keep state (held notes, notes that must end
 * later) and may emit events that fall in a later range from a later call.
 * Input and output are sorted by time, note-offs before note-ons at the same beat.
 */
export interface NoteProcessor {
  setParam(id: string, value: number): void
  process(input: readonly NoteEvent[], from: number, to: number): NoteEvent[]
  /** For nodes with several outputs: one event list per output, in the order of the definition's `outputs`. */
  processAll?(input: readonly NoteEvent[], from: number, to: number): NoteEvent[][]
  /** Forget everything (transport stopped, graph rebuilt). The caller silences the instrument itself. */
  reset(): void
}

/** What a node of the note graph does at its place in the graph. */
export type NoteNodeRole =
  /** Notes enter the graph here (the track's own clips, or another track). Ignores any input. */
  | 'source'
  /** Notes leave the graph here, for the instrument. */
  | 'sink'
  | 'effect'

export interface NoteNodeDefinition {
  readonly type: string
  readonly label: string
  readonly role: NoteNodeRole
  readonly inputs: readonly PortSpec[]
  readonly outputs: readonly PortSpec[]
  readonly params: readonly ParamSpec[]
  /** The node reads notes from another track; the patcher shows a track picker and stores `trackId`. */
  readonly usesTrack?: boolean
  create(): NoteProcessor
}

export const NOTE_IN: readonly PortSpec[] = [{ id: 'in', label: 'In', kind: 'notes' }]
export const NOTE_OUT: readonly PortSpec[] = [{ id: 'out', label: 'Out', kind: 'notes' }]
