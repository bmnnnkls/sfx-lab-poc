import type { NoteEvent } from '../session'
import { findNoteEffect } from './registry'
import type { NoteEffect, NoteProcessor } from './types'

interface Running {
  readonly effect: NoteEffect
  readonly processor: NoteProcessor
}

/**
 * A track's MIDI effects, running in order between the clip player and the instrument. Editing the chain
 * keeps the running state of effects that are still there (turning a knob never restarts an arpeggio); adding,
 * removing, reordering or re-typing effects restarts the chain and silences the instrument, since notes that
 * were mid-flight could otherwise be left hanging.
 */
export class NoteChain {
  private running: Running[] = []
  private restarted = false

  /** Applies a new list of effects. */
  sync(effects: readonly NoteEffect[]): void {
    const same =
      effects.length === this.running.length &&
      effects.every((effect, index) => {
        const current = this.running[index]?.effect
        return current !== undefined && current.id === effect.id && current.type === effect.type
      })

    if (!same) {
      this.running = effects.flatMap((effect) => {
        const definition = findNoteEffect(effect.type)
        return definition ? [{ effect, processor: definition.create() }] : []
      })
      this.restarted = true
    } else {
      this.running = this.running.map(({ processor }, index) => ({ processor, effect: effects[index] as NoteEffect }))
    }
    for (const { effect, processor } of this.running) {
      for (const [id, value] of Object.entries(effect.params)) processor.setParam(id, value)
    }
  }

  get isEmpty(): boolean {
    return this.running.every(({ effect }) => effect.bypassed)
  }

  /** The events leaving the chain for the beat range [from, to). With nothing active this is the input itself. */
  process(input: NoteEvent[], from: number, to: number): NoteEvent[] {
    let events: NoteEvent[] = input
    for (const { effect, processor } of this.running) {
      // A bypassed effect is skipped, but its state is dropped so it does not resume stale when switched on.
      if (effect.bypassed) {
        processor.reset()
        continue
      }
      events = processor.process(events, from, to)
    }
    if (this.restarted) {
      this.restarted = false
      return [{ beat: from, kind: 'allOff' }, ...events]
    }
    return events
  }

  /** Back to the start (transport stopped). */
  reset(): void {
    for (const { processor } of this.running) processor.reset()
    this.restarted = false
  }
}
