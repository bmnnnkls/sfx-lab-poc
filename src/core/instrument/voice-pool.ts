import type { Voice } from './voice'

/** Hands notes to voices: a free voice if there is one, otherwise steal. */
export class VoicePool {
  private clock = 0

  constructor(readonly voices: readonly Voice[]) {}

  get activeCount(): number {
    return this.voices.filter((voice) => voice.active).length
  }

  noteOn(pitch: number, velocity: number): void {
    this.allocate().start(pitch, velocity, this.clock++)
  }

  /** Releases the oldest still-held voice playing `pitch`. */
  noteOff(pitch: number): void {
    const held = this.voices
      .filter((voice) => voice.active && !voice.released && voice.pitch === pitch)
      .sort((a, b) => a.startedAt - b.startedAt)
    held[0]?.release()
  }

  releaseAll(): void {
    for (const voice of this.voices) voice.release()
  }

  private allocate(): Voice {
    const free = this.voices.find((voice) => !voice.active)
    if (free) return free

    // Prefer stealing a voice that is already fading out, then the oldest held one.
    const byAge = [...this.voices].sort((a, b) => a.startedAt - b.startedAt)
    return byAge.find((voice) => voice.released) ?? (byAge[0] as Voice)
  }
}
