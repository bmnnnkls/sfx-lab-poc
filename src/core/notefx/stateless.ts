import { Params, type ParamSpec } from '../dsp'
import type { NoteEvent } from '../session'
import type { NoteProcessor } from './types'

/** One note that comes out of a pitch transformation. */
export interface MappedNote {
  readonly pitch: number
  readonly velocity: number
}

/**
 * Base for effects that rewrite each note on its own (transpose, scale lock, chord, velocity). It remembers
 * what each note turned into when it started, so the matching note-off ends exactly those notes even if a
 * parameter was turned while the note was held.
 */
export abstract class MappingProcessor implements NoteProcessor {
  protected readonly params: Params
  private readonly sounding = new Map<number, number[]>()

  constructor(specs: readonly ParamSpec[]) {
    this.params = new Params(specs)
  }

  setParam(id: string, value: number): void {
    this.params.set(id, value)
  }

  /** The notes that replace one incoming note-on. */
  protected abstract map(pitch: number, velocity: number): MappedNote[]

  process(input: readonly NoteEvent[]): NoteEvent[] {
    const out: NoteEvent[] = []
    for (const event of input) {
      if (event.kind === 'noteOn') {
        const notes = this.map(event.pitch, event.velocity).filter((note) => note.pitch >= 0 && note.pitch <= 127)
        this.sounding.set(event.pitch, notes.map((note) => note.pitch))
        for (const note of notes) out.push({ beat: event.beat, kind: 'noteOn', pitch: note.pitch, velocity: note.velocity })
      } else if (event.kind === 'noteOff') {
        const pitches = this.sounding.get(event.pitch) ?? [event.pitch]
        this.sounding.delete(event.pitch)
        for (const pitch of pitches) out.push({ beat: event.beat, kind: 'noteOff', pitch })
      } else {
        this.sounding.clear()
        out.push(event)
      }
    }
    return out
  }

  reset(): void {
    this.sounding.clear()
  }
}
