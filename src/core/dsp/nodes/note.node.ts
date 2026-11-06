import type { DspNode, NodeDefinition, ProcessContext } from '../types'

/** Exposes the instrument's current note as frequency / gate / velocity signals, and the track's pressure and wheel. */
class NoteSource implements DspNode {
  private lastTrigger = 0

  setParam(): void {}

  process(context: ProcessContext, _inputs: unknown, outputs: readonly Float32Array[]): void {
    const [frequency, gate, velocity, pressure, bend] = outputs
    const { note, frames } = context
    frequency?.fill(note.frequency, 0, frames)
    gate?.fill(note.gate ? 1 : 0, 0, frames)
    velocity?.fill(note.velocity, 0, frames)
    pressure?.fill(note.pressure ?? 0, 0, frames)
    bend?.fill(note.bend ?? 0, 0, frames)

    // A note that steals a voice whose gate is still high would otherwise look like a continuation.
    // Dipping the gate for one sample gives envelopes and samplers the rising edge they trigger on.
    if (gate && note.gate && note.trigger !== this.lastTrigger) gate[0] = 0
    this.lastTrigger = note.trigger
  }
}

export const noteNode: NodeDefinition = {
  type: 'note',
  label: 'Note',
  inputs: [],
  outputs: [
    { id: 'frequency', label: 'Freq' },
    { id: 'gate', label: 'Gate' },
    { id: 'velocity', label: 'Vel' },
    // After the first three, so the outputs' order (which the node reads by index) stays the same for those.
    { id: 'pressure', label: 'Press' },
    { id: 'bend', label: 'Bend' },
  ],
  params: [],
  create: () => new NoteSource(),
}
