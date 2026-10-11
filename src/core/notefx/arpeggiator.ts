import { Params, type ParamSpec } from '../dsp'
import type { NoteEvent } from '../session'
import { EventQueue, compareEvents } from './events'
import type { NoteEffectDefinition, NoteProcessor } from './types'

const RATES = ['1/4', '1/8', '1/16', '1/32'] as const
/** Step length in beats for each rate. */
const RATE_BEATS = [1, 0.5, 0.25, 0.125]
const PATTERNS = ['up', 'down', 'up-down', 'as played', 'random'] as const

const PARAMS: readonly ParamSpec[] = [
  { id: 'rate', label: 'Rate', min: 0, max: RATES.length - 1, default: 1, step: 1, options: RATES },
  { id: 'pattern', label: 'Pattern', min: 0, max: PATTERNS.length - 1, default: 0, step: 1, options: PATTERNS },
  { id: 'octaves', label: 'Octaves', min: 1, max: 4, default: 1, step: 1 },
  { id: 'gate', label: 'Gate', min: 0.1, max: 1, default: 0.6, step: 0.01 },
]

interface HeldNote {
  readonly pitch: number
  readonly velocity: number
}

/** Tiny seeded generator so the "random" pattern is reproducible. */
const nextRandom = (state: number): number => (Math.imul(state, 1664525) + 1013904223) >>> 0

/** The order in which a set of held notes is stepped through. */
export const arpSequence = (held: readonly HeldNote[], pattern: string, octaves: number): HeldNote[] => {
  const ordered = pattern === 'as played' ? [...held] : [...held].sort((a, b) => a.pitch - b.pitch)
  const spread: HeldNote[] = []
  for (let octave = 0; octave < octaves; octave++) {
    for (const note of ordered) {
      if (note.pitch + octave * 12 <= 127) spread.push({ ...note, pitch: note.pitch + octave * 12 })
    }
  }
  if (pattern === 'down') return spread.reverse()
  if (pattern === 'up-down' && spread.length > 2) return spread.concat(spread.slice(1, -1).reverse())
  return spread
}

/**
 * Replaces held notes by a stream of single notes on a fixed grid: each grid step plays the next note of the
 * held chord. The grid is anchored to the transport's beats, so it is in time with everything else. A new
 * chord starts from the beginning of the pattern. Notes of the arpeggio last Gate × one step.
 */
class Arpeggiator implements NoteProcessor {
  private readonly params = new Params(PARAMS)
  private held: HeldNote[] = []
  private pending = new EventQueue()
  private stepIndex = 0
  private nextStep: number | null = null
  private seed = 0x2545f491

  setParam(id: string, value: number): void {
    this.params.set(id, value)
  }

  process(input: readonly NoteEvent[], from: number, to: number): NoteEvent[] {
    const step = RATE_BEATS[Math.round(this.params.get('rate'))] ?? 0.5
    const pattern = PATTERNS[Math.round(this.params.get('pattern'))] ?? 'up'
    const octaves = Math.round(this.params.get('octaves'))
    const gate = this.params.get('gate')

    // The grid point at or after `from` (after a pause or a rate change the old one may be stale).
    let stepBeat = this.nextStep
    if (stepBeat === null || stepBeat < from - 1e-9 || stepBeat % step > 1e-9) {
      stepBeat = Math.ceil(from / step - 1e-9) * step || 0
    }

    const out: NoteEvent[] = []
    let index = 0
    while (true) {
      const inputBeat = input[index]?.beat ?? Infinity
      if (inputBeat >= to && stepBeat >= to) break

      // Input at or before a step is handled first, so a chord that starts on a step is heard on that step.
      if (inputBeat <= stepBeat) {
        const event = input[index++] as NoteEvent
        this.handle(event, out)
      } else {
        this.fire(stepBeat, step, gate, pattern, octaves, out)
        stepBeat += step
      }
    }
    this.nextStep = stepBeat

    out.push(...this.pending.takeBefore(to))
    return out.sort(compareEvents)
  }

  private handle(event: NoteEvent, out: NoteEvent[]): void {
    if (event.kind === 'noteOn') {
      if (this.held.length === 0) this.stepIndex = 0
      this.held = [...this.held.filter((note) => note.pitch !== event.pitch), { pitch: event.pitch, velocity: event.velocity }]
    } else if (event.kind === 'noteOff') {
      this.held = this.held.filter((note) => note.pitch !== event.pitch)
    } else {
      // Everything off: silence the notes of the arpeggio too, right now.
      this.held = []
      this.pending.clear()
      out.push(event)
    }
  }

  private fire(beat: number, step: number, gate: number, pattern: string, octaves: number, out: NoteEvent[]): void {
    if (this.held.length === 0) return
    const sequence = arpSequence(this.held, pattern, octaves)
    if (sequence.length === 0) return
    let position = this.stepIndex
    if (pattern === 'random') {
      this.seed = nextRandom(this.seed)
      position = this.seed % sequence.length
    }
    const note = sequence[position % sequence.length] as HeldNote
    this.stepIndex++
    out.push({ beat, kind: 'noteOn', pitch: note.pitch, velocity: note.velocity })
    this.pending.add({ beat: beat + step * gate, kind: 'noteOff', pitch: note.pitch })
  }

  reset(): void {
    this.held = []
    this.pending = new EventQueue()
    this.stepIndex = 0
    this.nextStep = null
  }
}

export const arpeggiatorEffect: NoteEffectDefinition = {
  type: 'arpeggiator',
  label: 'Arpeggiator',
  params: PARAMS,
  create: () => new Arpeggiator(),
}
