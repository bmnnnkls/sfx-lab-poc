import type { ModuleDefinition } from '../../patch'
import { knob, moduleOf } from '../builder'

/**
 * The modules "Glass Rain" is built from. Three small ideas, each written once and used wherever the piece needs it:
 *
 *  - **Mallet**: a two-oscillator FM voice (a glassy bell, a marimba, a water drop, depending on the knobs).
 *  - **Scale note**: turns a number (a position on a scale) into the pitch of a note of D suspended pentatonic.
 *  - **Chance**: lets a clock through only some of the time, by rolling a die on every tick.
 */

export const MALLET = 'glass-rain-mallet'
export const SCALE_NOTE = 'glass-rain-scale-note'
export const CHANCE = 'glass-rain-chance'

/**
 * Mallet. FM synthesis built from nodes: a modulator oscillator at `Ratio` times the pitch bends the pitch of a carrier, and how
 * far it bends it (the index) is an envelope, so every note starts bright and mellows as it dies. Wire a pitch in Hz to `Pitch` and a
 * gate to `Gate`; `Velocity` scales the loudness (1 when nothing is wired). `Bend` makes the pitch start low and rise, the way a drop
 * of water sounds. Release equals decay, so a note rings its whole length however short the gate is.
 */
const mallet = (): ModuleDefinition =>
  moduleOf({
    id: MALLET,
    name: 'Mallet',
    nodes: [
      { id: 'pitch', type: 'gain', name: 'Pitch in' },
      { id: 'gate', type: 'gain', name: 'Gate in' },
      knob('ratio', 'Ratio', { value: 3.5, min: 0.5, max: 6, curve: 'log' }),
      knob('index', 'Bright', { value: 2.2, min: 0.2, max: 5 }),
      knob('decay', 'Decay', { value: 0.5, min: 0.1, max: 1.2, unit: 's', curve: 'log' }),
      knob('bend', 'Bend', { value: 0, min: 0, max: 0.2 }),
      { id: 'modPitch', type: 'multiply', name: 'Modulator pitch' },
      { id: 'mod', type: 'oscillator', name: 'Modulator', params: { waveform: 0 } },
      { id: 'indexEnv', type: 'envelope', name: 'Brightness fall', params: { attack: 0.001, sustain: 0 } },
      { id: 'indexShape', type: 'multiply', name: 'Brightness fall (squared)' },
      { id: 'swing', type: 'multiply', name: 'How far it bends' },
      { id: 'depth', type: 'multiply', name: 'Index in Hz' },
      { id: 'depthEnv', type: 'multiply', name: 'Index over time' },
      { id: 'wobble', type: 'multiply', name: 'Modulation' },
      { id: 'flatten', type: 'multiply', name: 'Starts low' },
      { id: 'start', type: 'subtract', name: '1 minus that', params: { a: 1 } },
      { id: 'base', type: 'multiply', name: 'Pitch with bend' },
      { id: 'carrierPitch', type: 'add', name: 'Carrier pitch' },
      { id: 'carrier', type: 'oscillator', name: 'Carrier', params: { waveform: 0 } },
      { id: 'ampEnv', type: 'envelope', name: 'Fall', params: { attack: 0.001, sustain: 0 } },
      { id: 'ampShape', type: 'multiply', name: 'Fall (squared)' },
      { id: 'loud', type: 'multiply', name: 'Loudness' },
      { id: 'vca', type: 'gain', name: 'Note shape' },
      { id: 'out', type: 'gain', name: 'Level', params: { gain: 0.5 } },
    ],
    wires: [
      'pitch.out>modPitch.a',
      'ratio.out>modPitch.b',
      'modPitch.out>mod.freq',
      'gate.out>indexEnv.gate',
      'gate.out>ampEnv.gate',
      'decay.out>indexEnv.param:decay',
      'decay.out>indexEnv.param:release',
      'decay.out>ampEnv.param:decay',
      'decay.out>ampEnv.param:release',
      'indexEnv.out>indexShape.a',
      'indexEnv.out>indexShape.b',
      // How far the carrier is pushed, in Hz: the pitch times the index, shaped by the falling envelope.
      'pitch.out>depth.a',
      'index.out>depth.b',
      'depth.out>depthEnv.a',
      'indexShape.out>depthEnv.b',
      'mod.out>wobble.a',
      'depthEnv.out>wobble.b',
      // The pitch, pulled down at the start of a note by `Bend` and rising as the brightness falls.
      'indexShape.out>swing.a',
      'bend.out>swing.b',
      'swing.out>start.b',
      'start.out>base.a',
      'pitch.out>base.b',
      'base.out>carrierPitch.a',
      'wobble.out>carrierPitch.b',
      'carrierPitch.out>carrier.freq',
      'ampEnv.out>ampShape.a',
      'ampEnv.out>ampShape.b',
      'ampShape.out>loud.a',
      'carrier.out>vca.in',
      'loud.out>vca.cv',
      'vca.out>out.in',
    ],
    inputs: [
      { label: 'Pitch', at: 'pitch.in' },
      { label: 'Gate', at: 'gate.in' },
      { label: 'Velocity', at: 'loud.b' },
      { label: 'Level', at: 'out.param:gain' },
    ],
    outputs: [{ label: 'Out', at: 'out.out' }],
  })

/**
 * Scale note. A position on the scale goes in (0 is the root, 1 the next note up, and so on; a fraction is rounded to the nearest
 * position); the pitch of that note comes out, in Hz, ready for an oscillator. The scale is D suspended pentatonic (D E G A C), which is a trick of rounding: the five notes are
 * `round(2.4 x position)` semitones above the root, so 0, 1, 2, 3, 4, 5 are 0, 2, 5, 7, 10, 12. Nothing in it can clash with a chord
 * on D or G, whatever order the positions come in. `Root` (the MIDI note of position 0, 74 until something is wired) and `Octave` are inputs, so the patch that uses it decides, and a Randomize cannot move the key.
 */
const scaleNote = (): ModuleDefinition =>
  moduleOf({
    id: SCALE_NOTE,
    name: 'Scale note',
    nodes: [
      { id: 'whole', type: 'quantize', name: 'A whole position', params: { step: 1 } },
      { id: 'steps', type: 'multiply', name: 'Position times 2.4', params: { b: 2.4 } },
      { id: 'snap', type: 'quantize', name: 'To a semitone', params: { step: 1 } },
      { id: 'octaveSemis', type: 'multiply', name: 'Octaves to semitones', params: { a: 0, b: 12 } },
      { id: 'base', type: 'add', name: 'Root and octave', params: { b: 74 } },
      { id: 'note', type: 'add', name: 'MIDI note' },
      { id: 'hz', type: 'midiToHz', name: 'To Hz' },
    ],
    wires: ['whole.out>steps.a', 'steps.out>snap.in', 'octaveSemis.out>base.a', 'snap.out>note.a', 'base.out>note.b', 'note.out>hz.note'],
    inputs: [
      { label: 'Position', at: 'whole.in' },
      { label: 'Root', at: 'base.b' },
      { label: 'Octave', at: 'octaveSemis.a' },
    ],
    outputs: [
      { label: 'Hz', at: 'hz.out' },
      { label: 'MIDI note', at: 'note.out' },
    ],
  })

/**
 * Chance. A die is rolled on every rising edge of the clock; the tick passes only when the roll is below `Density` (an input: wire a knob,
 * an XY pad or anything else into it). At 1 everything passes, at 0 nothing does, between is a rhythm that is the same every time the same seed is used (and different with another).
 */
const chance = (): ModuleDefinition =>
  moduleOf({
    id: CHANCE,
    name: 'Chance',
    nodes: [
      { id: 'clock', type: 'gain', name: 'Clock in' },
      { id: 'die', type: 'random', name: 'The die', params: { min: 0, max: 1, step: 0, seed: 1 } },
      { id: 'pass', type: 'compare', name: 'Density above the roll?', params: { a: 0.6 } },
      { id: 'gate', type: 'multiply', name: 'Tick and chance' },
    ],
    wires: ['clock.out>die.roll', 'die.out>pass.b', 'clock.out>gate.a', 'pass.out>gate.b'],
    inputs: [
      { label: 'Clock', at: 'clock.in' },
      { label: 'Density', at: 'pass.a' },
    ],
    outputs: [{ label: 'Gate', at: 'gate.out' }],
    knobs: [{ label: 'Seed', at: 'die.seed' }],
  })

export const generativeModules = (): ModuleDefinition[] => [mallet(), scaleNote(), chance()]
