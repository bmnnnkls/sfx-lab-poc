import { inNoteScope, noteKey, type NoteIdentity, type NoteScope } from '../session'
import type { Voice } from './voice'

/** Hands notes to voices: a free voice if there is one, otherwise steal. */
export class VoicePool {
  private clock = 0
  private readonly owners = new Map<Voice, NoteIdentity>()

  constructor(readonly voices: readonly Voice[]) {}

  get activeCount(): number {
    return this.voices.filter((voice) => voice.active).length
  }

  noteOn(pitch: number, velocity: number, identity?: NoteIdentity): void {
    const voice = this.allocate()
    this.owners.delete(voice)
    if (identity) this.owners.set(voice, identity)
    voice.start(pitch, velocity, this.clock++)
  }

  /** Releases the matching identity; legacy unidentified callers release their oldest matching pitch. */
  noteOff(pitch: number, identity?: NoteIdentity): void {
    const held = this.voices
      .filter((voice) => voice.active && !voice.released && (identity
        ? this.owners.has(voice) && noteKey({ pitch, identity: this.owners.get(voice) }) === noteKey({ pitch, identity })
        : !this.owners.has(voice) && voice.pitch === pitch))
      .sort((a, b) => a.startedAt - b.startedAt)
    held[0]?.release()
  }

  releaseAll(scope?: NoteScope): void {
    for (const voice of this.voices) if (inNoteScope(this.owners.get(voice), scope)) voice.release()
  }

  private allocate(): Voice {
    const free = this.voices.find((voice) => !voice.active)
    if (free) return free

    // Prefer stealing a voice that is already fading out, then the oldest held one.
    const byAge = [...this.voices].sort((a, b) => a.startedAt - b.startedAt)
    return byAge.find((voice) => voice.released) ?? (byAge[0] as Voice)
  }
}
