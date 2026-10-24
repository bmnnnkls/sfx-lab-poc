import { noteKey, inNoteScope, type NoteIdentity, type NoteEvent } from '../session'
import { compareEvents } from './events'

/**
 * Joins streams, counting duplicate routes of the same identity. Different identities remain independent even
 * at the same pitch. Unidentified legacy callers retain the original pitch-counting/retrigger behavior.
 */
export class Merger {
  private readonly identified = new Map<string, { count: number; identity: NoteIdentity }>()
  private readonly sounding = new Map<number, { count: number; start: number }>()

  /** `events` may be the concatenation of several streams; they are put in time order here. */
  process(events: readonly NoteEvent[]): NoteEvent[] {
    const out: NoteEvent[] = []
    for (const event of [...events].sort(compareEvents)) {
      if (event.kind !== 'allOff' && event.identity) {
        const key = noteKey(event)
        const current = this.identified.get(key)
        if (event.kind === 'noteOn') {
          if (current) current.count++
          else { this.identified.set(key, { count: 1, identity: event.identity }); out.push(event) }
        } else if (current) {
          if (--current.count === 0) { this.identified.delete(key); out.push(event) }
        }
        continue
      }
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
        if (!event.scope) this.sounding.clear()
        for (const [key, note] of this.identified) if (inNoteScope(note.identity, event.scope)) this.identified.delete(key)
        out.push(event)
      }
    }
    return out
  }

  reset(): void {
    this.identified.clear()
    this.sounding.clear()
  }
}
