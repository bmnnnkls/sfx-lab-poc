import type { ModuleDefinition } from '../../patch'
import { type NodeSpec, knob, meter, moduleOf } from '../builder'

/**
 * The three modules "Low Light" shares between tracks. Each is written once and used several times: edit the definition (open
 * any use, press Edit) and every track that uses it changes. Their knobs are control nodes inside, so they appear on the panel
 * of every track that uses them, each use with its own settings.
 */

export const SOFT_CLIP = 'low-light-soft-clip'
export const KICK_DUCK = 'low-light-kick-duck'
export const NOISE_HIT = 'low-light-noise-hit'
export const ORGAN = 'low-light-organ'

/** The id of the kick track, which the duck listens to. */
export const KICK_TRACK = 'kick'

/**
 * Soft clip: a gentle limiter that rounds the tops off instead of flattening them. The signal is driven, held to +-1 and passed
 * through `y = x - x^3/3`, whose slope falls to zero exactly where the clamp starts, so there is no corner. It adds the odd
 * harmonics that make a bass or a kick carry on a small speaker.
 */
const softClip = (): ModuleDefinition =>
  moduleOf({
    id: SOFT_CLIP,
    name: 'Soft clip',
    nodes: [
      knob('drive', 'Drive', { value: 1.5, min: 1, max: 3.5 }),
      { id: 'pre', type: 'gain', name: 'Drive' },
      { id: 'hold', type: 'clamp', name: 'Hold at +-1', params: { min: -1, max: 1 } },
      { id: 'square', type: 'multiply', name: 'x squared' },
      { id: 'third', type: 'multiply', name: 'a third of it', params: { b: 1 / 3 } },
      { id: 'knee', type: 'subtract', name: '1 minus that', params: { a: 1 } },
      { id: 'shape', type: 'multiply', name: 'x times that' },
      { id: 'makeup', type: 'gain', name: 'Make-up', params: { gain: 1.5 } },
    ],
    wires: [
      'drive.out>pre.param:gain',
      'pre.out>hold.in',
      'hold.out>square.a',
      'hold.out>square.b',
      'square.out>third.a',
      'third.out>knee.b',
      'hold.out>shape.a',
      'knee.out>shape.b',
      'shape.out>makeup.in',
    ],
    inputs: [{ label: 'In', at: 'pre.in' }],
    outputs: [{ label: 'Out', at: 'makeup.out' }],
  })

/**
 * Kick duck: sidechain compression done with nodes. It takes the kick's own sound (Track audio), follows how loud it is, turns
 * that into a dip in volume and applies the dip to whatever passes through. Because it listens to the audio, not to a pattern,
 * it ducks exactly where the kick sounds, however the kick is played.
 */
const kickDuck = (): ModuleDefinition =>
  moduleOf({
    id: KICK_DUCK,
    name: 'Kick duck',
    nodes: [
      { id: 'kick', type: 'trackAudio', name: 'The kick', trackId: KICK_TRACK, params: { tap: 1 } },
      { id: 'mono', type: 'monoSum' },
      knob('release', 'Release', { value: 150, min: 30, max: 500, unit: 'ms', curve: 'log' }),
      { id: 'follow', type: 'follower', name: 'How loud is the kick', params: { mode: 0, attack: 1.5, release: 150 } },
      knob('depth', 'Depth', { value: 0.7, min: 0, max: 1 }),
      // The follower's level (about 0.6 at a full kick) becomes a dip between 0 and `Duck`; anything louder than that is held at the full dip.
      { id: 'dip', type: 'mapRange', name: 'Level to dip', params: { inMin: 0, inMax: 0.6, outMin: 0 } },
      { id: 'rest', type: 'subtract', name: '1 minus the dip', params: { a: 1 } },
      { id: 'vca', type: 'gain', name: 'Dip the sound', stereo: true },
      meter('pump', 'Pump', 0, 1),
    ],
    wires: [
      'kick.out>mono.in',
      'mono.out>follow.in',
      'release.out>follow.param:release',
      'follow.out>dip.in',
      'depth.out>dip.param:outMax',
      'dip.out>rest.b',
      'dip.out>pump.in',
      'rest.out>vca.cv',
    ],
    inputs: [{ label: 'In', at: 'vca.in' }],
    outputs: [{ label: 'Out', at: 'vca.out' }],
  })

/**
 * Noise hit: one burst of filtered noise (and, if you turn Metal up, some ringing metal) per note, loudness from the note's velocity.
 * The hi-hat, the open hat, the shaker, the clap and the crash are all this module with different settings. Tone, body, decay, metal and
 * level are inputs, so each voice puts its own knobs on its own panel; the filter type and the noise seed are the module's knobs. Release equals decay, so the hit rings its whole length whatever the note's
 * length is (a 16th-note hit and a long one sound the same).
 */
const noiseHit = (): ModuleDefinition => {
  // The metal: six square waves at the inharmonic pitches of a classic analogue hi-hat. Only their upper harmonics get through the
  // filter, and together they are dense and metallic where plain noise is just hiss.
  const metals = [205.3, 304.4, 369.6, 522.7, 540, 800]
  return moduleOf({
    id: NOISE_HIT,
    name: 'Noise hit',
    nodes: [
      { id: 'noise', type: 'noise', params: { colour: 0, level: 1 } },
      ...metals.map((frequency, index): NodeSpec => ({ id: `metal${index}`, type: 'oscillator', name: `Metal ${index + 1}`, params: { waveform: 2, frequency } })),
      { id: 'metals', type: 'gain', name: 'Metal level', params: { gain: 0 } },
      { id: 'filt', type: 'filter', name: 'Colour', params: { mode: 1 } },
      { id: 'time', type: 'gain', name: 'Decay in' },
      { id: 'env', type: 'envelope', params: { attack: 0.001, sustain: 0 } },
      { id: 'bend', type: 'multiply', name: 'Envelope squared' },
      { id: 'hardness', type: 'multiply', name: 'Velocity' },
      { id: 'vca', type: 'gain' },
      { id: 'out', type: 'gain', name: 'Level', params: { gain: 0.5 } },
    ],
    wires: [
      'noise.out>filt.in',
      ...metals.map((_, index) => `metal${index}.out>metals.in`),
      'metals.out>filt.in',
      'time.out>env.param:decay',
      'time.out>env.param:release',
      'env.out>bend.a',
      'env.out>bend.b',
      'bend.out>hardness.a',
      'filt.out>vca.in',
      'hardness.out>vca.cv',
      'vca.out>out.in',
    ],
    inputs: [
      { label: 'Gate', at: 'env.gate' },
      { label: 'Velocity', at: 'hardness.b' },
      { label: 'Tone', at: 'filt.param:cutoff' },
      { label: 'Body', at: 'filt.param:resonance' },
      { label: 'Decay', at: 'time.in' },
      { label: 'Metal', at: 'metals.param:gain' },
      { label: 'Level', at: 'out.param:gain' },
    ],
    outputs: [{ label: 'Out', at: 'out.out' }],
    knobs: [
      { label: 'Filter', at: 'filt.mode' },
      { label: 'Noise seed', at: 'noise.seed' },
    ],
  })
}

/**
 * Organ: five sine drawbars at harmonics of the pitch it is given (in Hz, on `Pitch`): 16' (half the pitch), 8' (the pitch), 5 1/3'
 * (a fifth above), 4' (an octave up) and 2' (two octaves up). Pull them out for a hollow, a round or a bright stab. Sines only, so
 * there is nothing to alias however high a chord goes.
 */
const organ = (): ModuleDefinition => {
  const bars = [
    { id: 'sub', label: "16'", ratio: 0.5, level: 0.7 },
    { id: 'main', label: "8'", ratio: 1, level: 1 },
    { id: 'fifth', label: "5 1/3'", ratio: 1.5, level: 0.35 },
    { id: 'octave', label: "4'", ratio: 2, level: 0.55 },
    { id: 'bright', label: "2'", ratio: 4, level: 0.18 },
  ]
  const nodes: NodeSpec[] = [{ id: 'pitch', type: 'multiply', name: 'Pitch in', params: { a: 220, b: 1 } }]
  const wires: string[] = []
  for (const bar of bars) {
    nodes.push(
      { id: `${bar.id}Ratio`, type: 'multiply', name: `${bar.label} pitch`, params: { b: bar.ratio } },
      { id: `${bar.id}Osc`, type: 'oscillator', name: `${bar.label} sine`, params: { waveform: 0 } },
      knob(`${bar.id}Level`, bar.label, { value: bar.level, min: 0.05, max: 1 }),
      { id: `${bar.id}Vca`, type: 'gain', name: `${bar.label} level` },
    )
    wires.push(`pitch.out>${bar.id}Ratio.a`, `${bar.id}Ratio.out>${bar.id}Osc.freq`, `${bar.id}Osc.out>${bar.id}Vca.in`, `${bar.id}Level.out>${bar.id}Vca.param:gain`, `${bar.id}Vca.out>sum.in`)
  }
  nodes.push({ id: 'sum', type: 'gain', name: 'Sum', params: { gain: 0.34 } })
  return moduleOf({ id: ORGAN, name: 'Organ', nodes, wires, inputs: [{ label: 'Pitch', at: 'pitch.a' }], outputs: [{ label: 'Out', at: 'sum.out' }] })
}

export const techHouseModules = (): ModuleDefinition[] => [softClip(), kickDuck(), noiseHit(), organ()]
