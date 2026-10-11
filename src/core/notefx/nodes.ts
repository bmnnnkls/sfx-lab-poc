import { Params, type ParamSpec } from '../dsp'
import type { NoteEvent } from '../session'
import { NOTE_IN, NOTE_OUT, type NoteNodeDefinition, type NoteProcessor } from './types'

/** Hands its input on unchanged. Sources and sinks do their real work in the graph, which feeds them. */
class Passthrough implements NoteProcessor {
  setParam(): void {}
  process(input: readonly NoteEvent[]): NoteEvent[] {
    return input as NoteEvent[]
  }
  reset(): void {}
}

export const CLIP_NOTES_TYPE = 'clipNotes'
export const TRACK_NOTES_TYPE = 'trackNotes'
export const NOTE_OUT_TYPE = 'noteOut'
export const RANGE_SPLIT_TYPE = 'rangeSplit'

const TAPS = ['clip notes', 'after its graph'] as const

/** Where a Track notes node takes the notes from. */
export const TAP_AFTER_GRAPH = 1

const TRACK_PARAMS: readonly ParamSpec[] = [
  { id: 'tap', label: 'Take', min: 0, max: TAPS.length - 1, default: 0, step: 1, options: TAPS },
]

export const clipNotesNode: NoteNodeDefinition = {
  type: CLIP_NOTES_TYPE,
  label: 'Clip notes',
  role: 'source',
  inputs: [],
  outputs: NOTE_OUT,
  params: [],
  create: () => new Passthrough(),
}

export const trackNotesNode: NoteNodeDefinition = {
  type: TRACK_NOTES_TYPE,
  label: 'Track notes',
  role: 'source',
  inputs: [],
  outputs: NOTE_OUT,
  params: TRACK_PARAMS,
  usesTrack: true,
  create: () => new Passthrough(),
}

export const noteOutNode: NoteNodeDefinition = {
  type: NOTE_OUT_TYPE,
  label: 'To instrument',
  role: 'sink',
  inputs: NOTE_IN,
  outputs: [],
  params: [],
  create: () => new Passthrough(),
}

// ---- Range split

const SPLIT_PARAMS: readonly ParamSpec[] = [
  { id: 'lowPitch', label: 'Lowest', min: 0, max: 127, default: 60, step: 1, format: 'midiNote' },
  { id: 'highPitch', label: 'Highest', min: 0, max: 127, default: 127, step: 1, format: 'midiNote' },
  { id: 'minVelocity', label: 'Min velocity', min: 0, max: 1, default: 0, step: 0.01 },
  { id: 'maxVelocity', label: 'Max velocity', min: 0, max: 1, default: 1, step: 0.01 },
]

/**
 * Sends each note to `inside` when its pitch and velocity are in range, otherwise to `outside`. A note-off goes
 * where its note-on went, so a note is never started on one branch and ended on the other.
 */
class RangeSplit implements NoteProcessor {
  private readonly params = new Params(SPLIT_PARAMS)
  private readonly routed = new Map<number, number>()

  setParam(id: string, value: number): void {
    this.params.set(id, value)
  }

  process(input: readonly NoteEvent[]): NoteEvent[] {
    return this.processAll(input)[0] ?? []
  }

  processAll(input: readonly NoteEvent[]): NoteEvent[][] {
    const inside: NoteEvent[] = []
    const outside: NoteEvent[] = []
    const low = this.params.get('lowPitch')
    const high = this.params.get('highPitch')
    const minVelocity = this.params.get('minVelocity')
    const maxVelocity = this.params.get('maxVelocity')

    for (const event of input) {
      if (event.kind === 'noteOn') {
        const isInside =
          event.pitch >= low && event.pitch <= high && event.velocity >= minVelocity && event.velocity <= maxVelocity
        this.routed.set(event.pitch, isInside ? 0 : 1)
        ;(isInside ? inside : outside).push(event)
      } else if (event.kind === 'noteOff') {
        const branch = this.routed.get(event.pitch) ?? 1
        this.routed.delete(event.pitch)
        ;(branch === 0 ? inside : outside).push(event)
      } else {
        this.routed.clear()
        inside.push(event)
        outside.push(event)
      }
    }
    return [inside, outside]
  }

  reset(): void {
    this.routed.clear()
  }
}

export const rangeSplitNode: NoteNodeDefinition = {
  type: RANGE_SPLIT_TYPE,
  label: 'Range split',
  role: 'effect',
  inputs: NOTE_IN,
  outputs: [
    { id: 'inside', label: 'In range', kind: 'notes' },
    { id: 'outside', label: 'Outside', kind: 'notes' },
  ],
  params: SPLIT_PARAMS,
  create: () => new RangeSplit(),
}
