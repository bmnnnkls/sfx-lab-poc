import type { NoteEvent } from '../session'

const KIND_PRIORITY: Record<NoteEvent['kind'], number> = { allOff: 0, noteOff: 1, noteOn: 2 }

/** Time order, and at the same beat: everything off first, then note-offs, then note-ons. */
export const compareEvents = (a: NoteEvent, b: NoteEvent): number =>
  a.beat - b.beat || KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind]

/** Events scheduled for later, released as the clock reaches them. */
export class EventQueue {
  private events: NoteEvent[] = []

  add(event: NoteEvent): void {
    this.events.push(event)
  }

  /** Removes and returns the events due before `to` (in order). */
  takeBefore(to: number): NoteEvent[] {
    const due = this.events.filter((event) => event.beat < to)
    if (due.length > 0) this.events = this.events.filter((event) => event.beat >= to)
    return due.sort(compareEvents)
  }

  /** Removes everything and returns the note-offs that were still pending (so nothing stays on). */
  clear(): NoteEvent[] {
    const offs = this.events.filter((event) => event.kind === 'noteOff')
    this.events = []
    return offs
  }

  get size(): number {
    return this.events.length
  }
}
