import { Params, type ParamSpec } from '../dsp'
import type { NoteEvent } from '../session'
import { EventQueue, compareEvents } from './events'
import { NOTE_IN, NOTE_OUT, type NoteNodeDefinition, type NoteProcessor } from './types'

const TIMES = ['1/16', '1/8', 'dotted 1/8', '1/4', '1/2'] as const
const TIME_BEATS = [0.25, 0.5, 0.75, 1, 2]

const PARAMS: readonly ParamSpec[] = [
  { id: 'time', label: 'Time', min: 0, max: TIMES.length - 1, default: 1, step: 1, options: TIMES },
  { id: 'repeats', label: 'Repeats', min: 1, max: 8, default: 3, step: 1 },
  { id: 'decay', label: 'Decay', min: 0, max: 1, default: 0.6, step: 0.01 },
]

/** Each note is followed by quieter repeats of itself, in time with the grid. The original passes through. */
class Echo implements NoteProcessor {
  private readonly params = new Params(PARAMS)
  private pending = new EventQueue()

  setParam(id: string, value: number): void {
    this.params.set(id, value)
  }

  process(input: readonly NoteEvent[], _from: number, to: number): NoteEvent[] {
    const time = TIME_BEATS[Math.round(this.params.get('time'))] ?? 0.5
    const repeats = Math.round(this.params.get('repeats'))
    const decay = this.params.get('decay')

    const out: NoteEvent[] = []
    for (const event of input) {
      out.push(event)
      if (event.kind === 'allOff') {
        this.pending.clear()
      } else if (event.kind === 'noteOn') {
        let velocity = event.velocity
        for (let repeat = 1; repeat <= repeats; repeat++) {
          velocity *= decay
          if (velocity < 0.02) break
          const start = event.beat + repeat * time
          this.pending.add({ beat: start, kind: 'noteOn', pitch: event.pitch, velocity })
          this.pending.add({ beat: start + time * 0.5, kind: 'noteOff', pitch: event.pitch })
        }
      }
    }
    out.push(...this.pending.takeBefore(to))
    return out.sort(compareEvents)
  }

  reset(): void {
    this.pending = new EventQueue()
  }
}

export const echoEffect: NoteNodeDefinition = {
  type: 'echo',
  label: 'Echo',
  role: 'effect',
  inputs: NOTE_IN,
  outputs: NOTE_OUT,
  params: PARAMS,
  create: () => new Echo(),
}
