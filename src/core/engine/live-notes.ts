import { inNoteScope, noteKey, type NoteEvent, type NoteIdentity, type NoteScope } from '../session'

/** Adapter-provided id is unique per press, including repeated presses of the same pitch. */
export interface LiveNoteAddress {
  readonly sourceId: string
  /** Zero-based channel, 0..15. */
  readonly channel: number
  readonly noteId: string
}

export const liveSource = (sourceId: string): string => JSON.stringify(['live', sourceId])
export const clipSource = (trackId: string): string => JSON.stringify(['clip', trackId])

interface Held {
  readonly identity: NoteIdentity
  readonly pitch: number
  down: boolean
}

/** Transient input state. Commands take effect at the next render boundary, without a wall clock. */
export class LiveNotes {
  private readonly held = new Map<string, Held>()
  private readonly pedals = new Set<string>()
  private pending: NoteEvent[] = []

  noteOn(address: LiveNoteAddress, pitch: number, velocity: number): void {
    if (!address.sourceId || !address.noteId || !Number.isInteger(address.channel) || address.channel < 0 || address.channel > 15 ||
        !Number.isInteger(pitch) || pitch < 0 || pitch > 127 || !Number.isFinite(velocity) || velocity <= 0 || velocity > 1) return
    const identity = { source: liveSource(address.sourceId), channel: address.channel, id: address.noteId }
    const key = noteKey({ pitch, identity })
    if (this.held.has(key)) return
    this.held.set(key, { pitch, identity, down: true })
    this.pending.push({ beat: 0, kind: 'noteOn', pitch, velocity, identity })
  }

  noteOff(address: LiveNoteAddress): void {
    const identity = { source: liveSource(address.sourceId), channel: address.channel, id: address.noteId }
    const key = noteKey({ pitch: 0, identity })
    const note = this.held.get(key)
    if (!note || !note.down) return
    note.down = false
    if (!this.pedals.has(JSON.stringify([identity.source, identity.channel]))) this.release(key, note)
  }

  sustain(sourceId: string, channel: number, down: boolean): void {
    if (!sourceId || !Number.isInteger(channel) || channel < 0 || channel > 15) return
    const source = liveSource(sourceId)
    const pedal = JSON.stringify([source, channel])
    if (down) this.pedals.add(pedal)
    else {
      this.pedals.delete(pedal)
      for (const [key, note] of this.held) if (!note.down && inNoteScope(note.identity, { source, channel })) this.release(key, note)
    }
  }

  private release(key: string, note: Held): void {
    // A complete press between render calls has no duration; avoid an off-before-on hanging note.
    const queued = this.pending.findIndex((event) => event.kind === 'noteOn' && noteKey(event) === key)
    if (queued >= 0) this.pending.splice(queued, 1)
    else this.pending.push({ beat: 0, kind: 'noteOff', pitch: note.pitch, identity: note.identity })
    this.held.delete(key)
  }

  clear(scope?: NoteScope): void {
    for (const [key, note] of this.held) if (inNoteScope(note.identity, scope)) this.held.delete(key)
    this.pending = this.pending.filter((event) => event.kind !== 'allOff' && !inNoteScope(event.identity, scope))
    if (!scope) this.pedals.clear()
    else for (const pedal of this.pedals) {
      const [source, channel] = JSON.parse(pedal) as [string, number]
      if (source === scope.source && (scope.channel === undefined || channel === scope.channel)) this.pedals.delete(pedal)
    }
  }

  take(beat: number): NoteEvent[] {
    const events = this.pending.map((event) => ({ ...event, beat }))
    this.pending = []
    return events
  }
}
