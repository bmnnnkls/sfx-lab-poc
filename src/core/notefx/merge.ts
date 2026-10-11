import type { NoteEvent } from '../session'
import { compareEvents } from './events'

/**
 * Joins several note streams into one. The instrument matches note-offs by pitch, so two overlapping notes of
 * the same pitch (one from each stream) would cut each other short: the first note-off would end both. The
 * merger counts overlapping notes per pitch instead. A note-on for a pitch that is already sounding re-triggers it,
 * (unless it starts at the very same beat, when it is the same note), and a note-off is passed on only when the last
 * overlapping note of that pitch ends.
 */
export class Merger {
  private readonly sounding = new Map<number, { count: number; start: number }>()

  /** `events` may be the concatenation of several streams; they are put in time order here. */
  process(events: readonly NoteEvent[]): NoteEvent[] {
    const out: NoteEvent[] = []
    for (const event of [...events].sort(compareEvents)) {
      if (event.kind === 'noteOn') {
        const current = this.sounding.get(event.pitch)
        if (current && current.start === event.beat) {
          // The same note arriving by two routes at once is one note, not a re-trigger.
          current.count++
          continue
        }
        if (current) out.push({ beat: event.beat, kind: 'noteOff', pitch: event.pitch })
        this.sounding.set(event.pitch, { count: (current?.count ?? 0) + 1, start: event.beat })
        out.push(event)
      } else if (event.kind === 'noteOff') {
        const current = this.sounding.get(event.pitch)
        if (!current || current.count <= 1) {
          this.sounding.delete(event.pitch)
          out.push(event)
        } else {
          current.count--
        }
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
