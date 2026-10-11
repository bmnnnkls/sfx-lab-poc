import type { ParamSpec } from '../dsp'
import type { NoteEvent } from '../session'

/** One MIDI effect in a track's chain, as saved in the project. */
export interface NoteEffect {
  readonly id: string
  /** Key into the note effect registry. */
  readonly type: string
  readonly params: Readonly<Record<string, number>>
  /** A bypassed effect stays in the chain but passes notes through untouched. */
  readonly bypassed: boolean
  /** For `module` entries: which module definition this is a use of. `params` then holds the exposed knobs. */
  readonly moduleId?: string
}

/**
 * The running side of one effect: turns the note events of a beat range [from, to) into the events that
 * come out of it. Ranges are contiguous across calls, so an effect may keep state (held notes, notes that
 * must end later) and may emit events that fall in a later range from a later call.
 * Input and output are sorted by time, note-offs before note-ons at the same beat.
 */
export interface NoteProcessor {
  setParam(id: string, value: number): void
  process(input: readonly NoteEvent[], from: number, to: number): NoteEvent[]
  /** Forget everything (transport stopped, chain rebuilt). The caller silences the instrument itself. */
  reset(): void
}

export interface NoteEffectDefinition {
  readonly type: string
  readonly label: string
  readonly params: readonly ParamSpec[]
  create(): NoteProcessor
}
