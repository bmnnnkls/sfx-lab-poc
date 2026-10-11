import type { ParamSpec } from '../dsp'
import { clamp } from '../shared'
import { MappingProcessor, type MappedNote } from './stateless'
import { NOTE_IN, NOTE_OUT, type NoteNodeDefinition } from './types'

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

/** Semitones above the root for each note of a scale. */
export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  'harmonic minor': [0, 2, 3, 5, 7, 8, 11],
  'major pentatonic': [0, 2, 4, 7, 9],
  'minor pentatonic': [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
} as const
const SCALE_NAMES = Object.keys(SCALES) as (keyof typeof SCALES)[]

/** Semitones above the played note for each note of a chord. */
export const CHORDS = {
  octave: [0, 12],
  fifth: [0, 7],
  major: [0, 4, 7],
  minor: [0, 3, 7],
  sus4: [0, 5, 7],
  'major 7th': [0, 4, 7, 11],
  'minor 7th': [0, 3, 7, 10],
  dominant: [0, 4, 7, 10],
} as const
const CHORD_NAMES = Object.keys(CHORDS) as (keyof typeof CHORDS)[]

const clampVelocity = (value: number): number => clamp(value, 0.01, 1)

// ---- Transpose

const TRANSPOSE_PARAMS: readonly ParamSpec[] = [
  { id: 'semitones', label: 'Semitones', min: -24, max: 24, default: 0, step: 1, unit: 'st' },
]

class Transpose extends MappingProcessor {
  constructor() {
    super(TRANSPOSE_PARAMS)
  }

  protected map(pitch: number, velocity: number): MappedNote[] {
    return [{ pitch: pitch + Math.round(this.params.get('semitones')), velocity }]
  }
}

// ---- Scale lock

const SCALE_PARAMS: readonly ParamSpec[] = [
  { id: 'root', label: 'Root', min: 0, max: 11, default: 0, step: 1, options: NOTE_NAMES },
  { id: 'scale', label: 'Scale', min: 0, max: SCALE_NAMES.length - 1, default: 1, step: 1, options: SCALE_NAMES },
]

/** The pitch nearest to `pitch` that is in the scale (a tie goes down). */
export const snapToScale = (pitch: number, root: number, scale: readonly number[]): number => {
  const inScale = (candidate: number) => scale.includes((((candidate - root) % 12) + 12) % 12)
  for (let distance = 0; distance <= 6; distance++) {
    if (inScale(pitch - distance)) return pitch - distance
    if (inScale(pitch + distance)) return pitch + distance
  }
  return pitch
}

class ScaleLock extends MappingProcessor {
  constructor() {
    super(SCALE_PARAMS)
  }

  protected map(pitch: number, velocity: number): MappedNote[] {
    const scale = SCALES[SCALE_NAMES[Math.round(this.params.get('scale'))] ?? 'major']
    return [{ pitch: snapToScale(pitch, Math.round(this.params.get('root')), scale), velocity }]
  }
}

// ---- Chord

const CHORD_PARAMS: readonly ParamSpec[] = [
  { id: 'chord', label: 'Chord', min: 0, max: CHORD_NAMES.length - 1, default: 2, step: 1, options: CHORD_NAMES },
]

class Chord extends MappingProcessor {
  constructor() {
    super(CHORD_PARAMS)
  }

  protected map(pitch: number, velocity: number): MappedNote[] {
    const intervals = CHORDS[CHORD_NAMES[Math.round(this.params.get('chord'))] ?? 'major']
    return intervals.map((interval) => ({ pitch: pitch + interval, velocity }))
  }
}

// ---- Velocity

const VELOCITY_PARAMS: readonly ParamSpec[] = [
  { id: 'scale', label: 'Scale', min: 0, max: 2, default: 1, step: 0.01 },
  { id: 'offset', label: 'Offset', min: -1, max: 1, default: 0, step: 0.01 },
]

class Velocity extends MappingProcessor {
  constructor() {
    super(VELOCITY_PARAMS)
  }

  protected map(pitch: number, velocity: number): MappedNote[] {
    return [{ pitch, velocity: clampVelocity(velocity * this.params.get('scale') + this.params.get('offset')) }]
  }
}

export const transposeEffect: NoteNodeDefinition = {
  type: 'transpose',
  label: 'Transpose',
  role: 'effect',
  inputs: NOTE_IN,
  outputs: NOTE_OUT,
  params: TRANSPOSE_PARAMS,
  create: () => new Transpose(),
}

export const scaleLockEffect: NoteNodeDefinition = {
  type: 'scaleLock',
  label: 'Scale lock',
  role: 'effect',
  inputs: NOTE_IN,
  outputs: NOTE_OUT,
  params: SCALE_PARAMS,
  create: () => new ScaleLock(),
}

export const chordEffect: NoteNodeDefinition = {
  type: 'chord',
  label: 'Chord',
  role: 'effect',
  inputs: NOTE_IN,
  outputs: NOTE_OUT,
  params: CHORD_PARAMS,
  create: () => new Chord(),
}

export const velocityEffect: NoteNodeDefinition = {
  type: 'velocity',
  label: 'Velocity',
  role: 'effect',
  inputs: NOTE_IN,
  outputs: NOTE_OUT,
  params: VELOCITY_PARAMS,
  create: () => new Velocity(),
}
