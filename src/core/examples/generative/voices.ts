import type { ModuleLibrary, Patch } from '../../patch'
import { type NodeSpec, knob, led, patchOf, useModule, xyPad } from '../builder'
import { CHANCE, MALLET, SCALE_NOTE } from './modules'

/**
 * The voices of "Glass Rain". Several of them play themselves: the clip only has to hold one note, and the patch does the rest
 * with a clock, a die, a wandering line and a scale. They start on the beat their note starts on, so they stay in time with
 * everything else, and every random source is seeded, so a patch plays the same every time unless you roll a new seed (Randomize).
 *
 * Every node is locked against Randomize and Mutate (the builder's rule) except the controls and the sources of chance, which say
 * `locked: false`: they move the knobs and the seeds and leave the wiring and the structure alone, so pressing them composes a new
 * variation, never a broken patch.
 */

/** An envelope multiplied by itself (a fall that is quick at first, with a long tail). */
const squared = (env: string, shape: string, name: string): { node: NodeSpec; wires: string[] } => ({
  node: { id: shape, type: 'multiply', name },
  wires: [`${env}.out>${shape}.a`, `${env}.out>${shape}.b`],
})

/**
 * The bells: a melody that composes itself. A Perlin noise wanders up and down; on every tick of a clock the wander is sampled
 * (Sample and hold), turned into a note of the scale, and a die decides whether the tick sounds. Turn Density up for a busier line,
 * the wander speed up for a more restless melody, and the clock rate to change how fast it moves. The note's gate starts the clock
 * and the wander from the start, so the line begins on the bar and repeats every time the clip loops. The pitch and the loudness are
 * only taken when a note sounds (the gate of the Chance module is what asks), so a tick the die turns down leaves the ringing tail of
 * the last bell alone instead of retuning it.
 */
export const bellsPatch = (modules: ModuleLibrary): Patch =>
  patchOf(
    [
      { id: 'note', type: 'note' },
      { id: 'clock', type: 'clock', name: 'Clock', params: { unit: 2, rate: 1.5, width: 0.4 } },
      useModule('chance', CHANCE, { 'die:seed': 3 }, 'Chance'),
      { id: 'wander', type: 'perlin', name: 'Melody wander', params: { rate: 0.45, octaves: 3, persistence: 0.6, depth: 1, seed: 5 }, locked: false },
      { id: 'position', type: 'mapRange', name: 'Wander to a position', params: { inMin: -0.5, inMax: 0.5, outMin: 0, outMax: 9.99 } },
      { id: 'pick', type: 'sampleHold', name: 'Take a note each tick' },
      useModule('scale', SCALE_NOTE, {}, 'Scale'),
      { id: 'touch', type: 'random', name: 'How hard', params: { min: 0.35, max: 1, step: 0, seed: 11 }, locked: false },
      useModule('mallet', MALLET, { 'ratio:value': 3.5, 'index:value': 2.2, 'decay:value': 0.55 }, 'Mallet'),
      { id: 'on', type: 'envelope', name: 'While the note is held', params: { attack: 0.005, decay: 0.01, sustain: 1, release: 0.3 } },
      { id: 'hold', type: 'gain', name: 'Silent when the note ends' },
      { id: 'scene', type: 'multiply', name: 'Scene loudness (velocity)' },
      { id: 'out', type: 'output' },
      xyPad(
        'feel',
        'Density / Restlessness',
        { value: 0.55, min: 0.15, max: 1, curve: 'linear' },
        { value: 0.45, min: 0.04, max: 2, unit: 'Hz', curve: 'log' },
        'M',
      ),
      knob('rate', 'Rate', { value: 1.5, min: 0.5, max: 4, unit: '/beat', step: 0.5 }),
      knob('root', 'Root note', { value: 62, min: 36, max: 96, unit: 'MIDI', step: 1, locked: true }),
      knob('octave', 'Octave', { value: 0, min: -2, max: 2, step: 1 }),
      knob('level', 'Level', { value: 0.62, min: 0, max: 1.5, locked: true }),
      led('tick', 'Tick', { threshold: 0.5, colour: 'blue' }),
    ],
    [
      'note.gate>clock.reset',
      'note.gate>wander.gate',
      'rate.out>clock.param:rate',
      'clock.out>chance.clock:in',
      'feel.x>chance.pass:a',
      'feel.y>wander.param:rate',
      'wander.out>position.in',
      'position.out>pick.in',
      'chance.gate:out>pick.trigger',
      'pick.out>scale.whole:in',
      'root.out>scale.base:b',
      'octave.out>scale.octaveSemis:a',
      'chance.gate:out>touch.roll',
      'scale.hz:out>mallet.pitch:in',
      'chance.gate:out>mallet.gate:in',
      'touch.out>mallet.loud:b',
      'level.out>mallet.out:param:gain',
      'chance.gate:out>tick.in',
      'note.gate>on.gate',
      'mallet.out:out>hold.in',
      'on.out>scene.a',
      'note.velocity>scene.b',
      'scene.out>hold.cv',
      'hold.out>out.in',
    ],
    { prefix: 'n_', modules },
  )

/**
 * The drops: rain as notes. A Geiger counter clicks at random times; every click draws a position on the scale at random, and a
 * Mallet sounds it as a short drop that starts low and rises, the way water does. The pad moves the rain's rate and how high
 * the drops may go. Because the scale only has notes that agree with each other, a downpour is a chord, never a mess.
 */
export const dropsPatch = (modules: ModuleLibrary): Patch =>
  patchOf(
    [
      { id: 'note', type: 'note' },
      { id: 'rain', type: 'geiger', name: 'Raindrops', params: { rate: 2.6, decay: 1, spread: 0.8, gate: 0.03, seed: 9 }, locked: false },
      { id: 'pick', type: 'random', name: 'Which note', params: { min: 0, max: 8.99, step: 1, seed: 4 }, locked: false },
      { id: 'touch', type: 'random', name: 'How hard', params: { min: 0.3, max: 1, step: 0, seed: 6 }, locked: false },
      useModule('scale', SCALE_NOTE, {}, 'Scale'),
      useModule('mallet', MALLET, { 'ratio:value': 1.02, 'index:value': 0.9, 'decay:value': 0.2, 'bend:value': 0.09 }, 'Drop'),
      { id: 'on', type: 'envelope', name: 'While the note is held', params: { attack: 0.005, decay: 0.01, sustain: 1, release: 0.3 } },
      { id: 'hold', type: 'gain', name: 'Silent when the note ends' },
      { id: 'scene', type: 'multiply', name: 'Scene loudness (velocity)' },
      { id: 'out', type: 'output' },
      xyPad(
        'weather',
        'Rain rate / Pitch range',
        { value: 2.6, min: 0.2, max: 16, unit: '/s', curve: 'log' },
        { value: 8.99, min: 1, max: 14.99, curve: 'linear' },
        'M',
      ),
      knob('root', 'Root note', { value: 74, min: 36, max: 96, unit: 'MIDI', step: 1, locked: true }),
      knob('octave', 'Octave', { value: 0, min: -2, max: 2, step: 1 }),
      knob('level', 'Level', { value: 0.85, min: 0, max: 1.5, locked: true }),
      led('drip', 'Drip', { threshold: 0.5, colour: 'blue' }),
    ],
    [
      'weather.x>rain.param:rate',
      'weather.y>pick.param:max',
      'rain.trigger>pick.roll',
      'rain.trigger>touch.roll',
      'rain.trigger>drip.in',
      'pick.out>scale.whole:in',
      'root.out>scale.base:b',
      'octave.out>scale.octaveSemis:a',
      'scale.hz:out>mallet.pitch:in',
      'rain.trigger>mallet.gate:in',
      'touch.out>mallet.loud:b',
      'level.out>mallet.out:param:gain',
      'note.gate>on.gate',
      'mallet.out:out>hold.in',
      'on.out>scene.a',
      'note.velocity>scene.b',
      'scene.out>hold.cv',
      'hold.out>out.in',
    ],
    { prefix: 'n_', modules },
  )

/**
 * Rain you hear as a surface: two Geiger counters, one for the fine patter (dense, tiny clicks, high-passed) and one for the bigger
 * splashes (rare, long clicks, low-passed), mixed under a slow fade in and out.
 */
export const rainPatch = (): Patch =>
  patchOf(
    [
      { id: 'note', type: 'note' },
      { id: 'patter', type: 'geiger', name: 'Patter', params: { rate: 70, decay: 1.2, spread: 0.9, seed: 2 }, locked: false },
      { id: 'patterHp', type: 'filter', name: 'Patter tone', params: { mode: 1, cutoff: 2800, resonance: 0.7 } },
      { id: 'splash', type: 'geiger', name: 'Splashes', params: { rate: 9, decay: 7, spread: 1, seed: 3 }, locked: false },
      { id: 'splashLp', type: 'filter', name: 'Splash tone', params: { mode: 0, cutoff: 5200, resonance: 0.8 } },
      { id: 'splashLevel', type: 'gain', name: 'Splash level', params: { gain: 0.8 } },
      { id: 'mix', type: 'gain', name: 'Mix' },
      { id: 'fade', type: 'envelope', name: 'Fade', params: { attack: 1.4, decay: 0.2, sustain: 1, release: 1.8 } },
      { id: 'amp', type: 'gain', name: 'Fade shape' },
      { id: 'scene', type: 'multiply', name: 'Scene loudness (velocity)' },
      { id: 'level', type: 'gain', name: 'Level' },
      { id: 'out', type: 'output' },
      xyPad(
        'weather',
        'Downpour / Brightness',
        { value: 70, min: 4, max: 220, unit: '/s', curve: 'log' },
        { value: 2800, min: 700, max: 9000, unit: 'Hz', curve: 'log' },
        'M',
      ),
      knob('splashes', 'Splashes', { value: 9, min: 0, max: 40, unit: '/s', curve: 'exp' }),
      knob('trim', 'Level', { value: 1.5, min: 0, max: 2.5, locked: true }),
    ],
    [
      'weather.x>patter.param:rate',
      'weather.y>patterHp.param:cutoff',
      'splashes.out>splash.param:rate',
      'patter.click>patterHp.in',
      'patterHp.out>mix.in',
      'splash.click>splashLp.in',
      'splashLp.out>splashLevel.in',
      'splashLevel.out>mix.in',
      'note.gate>fade.gate',
      'mix.out>amp.in',
      'fade.out>scene.a',
      'note.velocity>scene.b',
      'scene.out>amp.cv',
      'amp.out>level.in',
      'trim.out>level.param:gain',
      'level.out>out.in',
    ],
    { prefix: 'n_' },
  )

/** Wind: brown noise through a band-pass that a slow Perlin wander sweeps up and down. */
export const windPatch = (): Patch =>
  patchOf(
    [
      { id: 'note', type: 'note' },
      { id: 'noise', type: 'noise', name: 'Air', params: { colour: 2, level: 1, seed: 8 } },
      { id: 'gust', type: 'perlin', name: 'Gusts', params: { rate: 0.13, octaves: 3, persistence: 0.55, depth: 1, seed: 12 }, locked: false },
      { id: 'filt', type: 'filter', name: 'Band of wind', params: { mode: 2, cutoff: 650, resonance: 3.2, cvAmount: 1.6 } },
      { id: 'fade', type: 'envelope', name: 'Fade', params: { attack: 2, decay: 0.2, sustain: 1, release: 3.5 } },
      { id: 'amp', type: 'gain', name: 'Fade shape' },
      { id: 'scene', type: 'multiply', name: 'Scene loudness (velocity)' },
      { id: 'level', type: 'gain', name: 'Level' },
      { id: 'out', type: 'output' },
      knob('pitch', 'Pitch', { value: 650, min: 150, max: 3000, unit: 'Hz', curve: 'log' }),
      knob('howl', 'Howl', { value: 3.2, min: 0.7, max: 9, curve: 'log' }),
      knob('sweep', 'Gust size', { value: 1.6, min: 0, max: 3.5, unit: 'oct', step: 0.1 }),
      knob('trim', 'Level', { value: 0.62, min: 0, max: 1, locked: true }),
    ],
    [
      'noise.out>filt.in',
      'gust.out>filt.cutoff',
      'pitch.out>filt.param:cutoff',
      'howl.out>filt.param:resonance',
      'sweep.out>filt.param:cvAmount',
      'note.gate>fade.gate',
      'filt.out>amp.in',
      'fade.out>scene.a',
      'note.velocity>scene.b',
      'scene.out>amp.cv',
      'amp.out>level.in',
      'trim.out>level.param:gain',
      'level.out>out.in',
    ],
    { prefix: 'n_' },
  )

/**
 * The pad: two detuned saws and a triangle through a low-pass that an LFO, locked to the tempo (one slow breath every four bars),
 * opens and closes. One voice per note of the chord.
 */
export const padPatch = (): Patch =>
  patchOf(
    [
      { id: 'note', type: 'note' },
      { id: 'sawA', type: 'oscillator', name: 'Saw left', params: { waveform: 1, detune: -9 } },
      { id: 'sawB', type: 'oscillator', name: 'Saw right', params: { waveform: 1, detune: 9 } },
      { id: 'tri', type: 'oscillator', name: 'Triangle', params: { waveform: 3 } },
      { id: 'sawMix', type: 'gain', name: 'Saws', params: { gain: 0.22 } },
      { id: 'triMix', type: 'gain', name: 'Triangle', params: { gain: 0.4 } },
      { id: 'breath', type: 'lfo', name: 'Breath', params: { shape: 0, rate: 0.0625, sync: 1, depth: 1 } },
      { id: 'filt', type: 'filter', name: 'Warmth', params: { mode: 0, cutoff: 1300, resonance: 0.9, cvAmount: 1.4 } },
      { id: 'swell', type: 'envelope', name: 'Swell', params: { attack: 1.6, decay: 1, sustain: 0.85, release: 3.4 } },
      { id: 'amp', type: 'gain', name: 'Swell shape' },
      { id: 'scene', type: 'multiply', name: 'Soft or hard (velocity)' },
      { id: 'level', type: 'gain', name: 'Level' },
      { id: 'out', type: 'output' },
      knob('warmth', 'Warmth', { value: 1300, min: 200, max: 6000, unit: 'Hz', curve: 'log' }),
      knob('breathe', 'Breath', { value: 1.4, min: 0, max: 3, unit: 'oct', step: 0.05 }),
      knob('detune', 'Detune', { value: 9, min: 0, max: 30, unit: 'ct', step: 1 }),
      knob('trim', 'Level', { value: 0.5, min: 0, max: 1, locked: true }),
      { id: 'flip', type: 'invert', name: 'Opposite detune' },
    ],
    [
      'note.frequency>sawA.freq',
      'note.frequency>sawB.freq',
      'note.frequency>tri.freq',
      'detune.out>sawA.param:detune',
      'detune.out>flip.in',
      'flip.out>sawB.param:detune',
      'sawA.out>sawMix.in',
      'sawB.out>sawMix.in',
      'tri.out>triMix.in',
      'sawMix.out>filt.in',
      'triMix.out>filt.in',
      'breath.out>filt.cutoff',
      'warmth.out>filt.param:cutoff',
      'breathe.out>filt.param:cvAmount',
      'note.gate>swell.gate',
      'filt.out>amp.in',
      'swell.out>scene.a',
      'note.velocity>scene.b',
      'scene.out>amp.cv',
      'amp.out>level.in',
      'trim.out>level.param:gain',
      'level.out>out.in',
    ],
    { prefix: 'n_' },
  )

/** The sub: a sine and a touch of its octave, slow to start, for the floor under the pad. */
export const subPatch = (): Patch =>
  patchOf(
    [
      { id: 'note', type: 'note' },
      { id: 'sine', type: 'oscillator', name: 'Sine', params: { waveform: 0 } },
      { id: 'tri', type: 'oscillator', name: 'Overtone', params: { waveform: 3, detune: 1200 } },
      { id: 'triMix', type: 'gain', name: 'Overtone level', params: { gain: 0.18 } },
      { id: 'env', type: 'envelope', name: 'Swell', params: { attack: 0.35, decay: 1.2, sustain: 0.8, release: 0.9 } },
      { id: 'amp', type: 'gain', name: 'Swell shape' },
      { id: 'level', type: 'gain', name: 'Level' },
      { id: 'out', type: 'output' },
      knob('warm', 'Overtone', { value: 0.18, min: 0, max: 0.6 }),
      knob('trim', 'Level', { value: 0.48, min: 0, max: 1, locked: true }),
    ],
    [
      'note.frequency>sine.freq',
      'note.frequency>tri.freq',
      'sine.out>amp.in',
      'tri.out>triMix.in',
      'warm.out>triMix.param:gain',
      'triMix.out>amp.in',
      'note.gate>env.gate',
      'env.out>amp.cv',
      'amp.out>level.in',
      'trim.out>level.param:gain',
      'level.out>out.in',
    ],
    { prefix: 'n_' },
  )

/**
 * The heartbeat: a kick as a filter ping, like the one in Low Light but softer and longer (see its kick for how it works). It plays
 * every dotted quarter, three beats against the four of the bar, so it drifts through the other parts instead of agreeing with them.
 */
export const heartPatch = (): Patch => {
  const fall = squared('ampEnv', 'ampShape', 'Fall (squared)')
  const dive = squared('diveEnv', 'diveShape', 'Dive (squared)')
  return patchOf(
    [
      { id: 'note', type: 'note' },
      { id: 'pulseEnv', type: 'envelope', name: 'Impulse', params: { attack: 0.001, decay: 0.002, sustain: 0, release: 0.001 } },
      { id: 'pulseGain', type: 'gain', name: 'Impulse strength', params: { gain: 2 } },
      { id: 'diveEnv', type: 'envelope', name: 'Dive time', params: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.12 } },
      dive.node,
      { id: 'ring', type: 'filter', name: 'Ring', params: { mode: 0, cutoff: 55, resonance: 5, cvAmount: 1.1 } },
      { id: 'ampEnv', type: 'envelope', name: 'Length', params: { attack: 0.002, decay: 0.8, sustain: 0, release: 0.8 } },
      fall.node,
      { id: 'tail', type: 'gain', name: 'Tail' },
      { id: 'scene', type: 'multiply', name: 'Hit strength (velocity)' },
      { id: 'level', type: 'gain', name: 'Level' },
      { id: 'out', type: 'output' },
      knob('tune', 'Tune', { value: 55, min: 36, max: 80, unit: 'Hz', curve: 'log' }),
      knob('punch', 'Punch', { value: 1.1, min: 0, max: 2.5, unit: 'oct', step: 0.05 }),
      knob('length', 'Length', { value: 0.8, min: 0.2, max: 1.6, unit: 's', curve: 'log' }),
      knob('trim', 'Level', { value: 1.6, min: 0, max: 2, locked: true }),
      led('beat', 'Beat', { threshold: 0.5, colour: 'amber' }),
    ],
    [
      'note.gate>pulseEnv.gate',
      'note.gate>diveEnv.gate',
      'note.gate>ampEnv.gate',
      'note.gate>beat.in',
      ...dive.wires,
      ...fall.wires,
      'pulseEnv.out>pulseGain.in',
      'pulseGain.out>ring.in',
      'diveShape.out>ring.cutoff',
      'tune.out>ring.param:cutoff',
      'punch.out>ring.param:cvAmount',
      'length.out>ampEnv.param:decay',
      'length.out>ampEnv.param:release',
      'ring.out>tail.in',
      'ampShape.out>scene.a',
      'note.velocity>scene.b',
      'scene.out>tail.cv',
      'tail.out>level.in',
      'trim.out>level.param:gain',
      'level.out>out.in',
    ],
    { prefix: 'n_' },
  )
}

/**
 * Ticks: a hi-hat that plays itself. A clock at sixteenths, a die that decides which ticks sound, a second die that gives each its
 * own brightness and loudness. Density from nothing to a roll; every setting between is a different groove.
 */
export const ticksPatch = (modules: ModuleLibrary): Patch => {
  const fall = squared('env', 'envShape', 'Fall (squared)')
  return patchOf(
    [
      { id: 'note', type: 'note' },
      { id: 'clock', type: 'clock', name: 'Clock', params: { unit: 2, rate: 4, width: 0.3 } },
      useModule('chance', CHANCE, { 'die:seed': 21 }, 'Chance'),
      { id: 'colour', type: 'random', name: 'Brightness of each tick', params: { min: 4500, max: 11000, step: 0, seed: 22 }, locked: false },
      { id: 'touch', type: 'random', name: 'How hard', params: { min: 0.25, max: 1, step: 0, seed: 23 }, locked: false },
      { id: 'noise', type: 'noise', name: 'Noise', params: { colour: 0, level: 1, seed: 24 } },
      { id: 'hp', type: 'filter', name: 'High-pass', params: { mode: 1, cutoff: 7000, resonance: 1.1 } },
      { id: 'env', type: 'envelope', name: 'Tick', params: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.03 } },
      fall.node,
      { id: 'loud', type: 'multiply', name: 'Loudness' },
      { id: 'vca', type: 'gain', name: 'Tick shape' },
      { id: 'on', type: 'envelope', name: 'While the note is held', params: { attack: 0.005, decay: 0.01, sustain: 1, release: 0.3 } },
      { id: 'hold', type: 'gain', name: 'Silent when the note ends' },
      { id: 'scene', type: 'multiply', name: 'Scene loudness (velocity)' },
      { id: 'level', type: 'gain', name: 'Level' },
      { id: 'out', type: 'output' },
      xyPad('feel', 'Density / Length', { value: 0.4, min: 0, max: 1 }, { value: 0.03, min: 0.008, max: 0.2, unit: 's', curve: 'log' }, 'M'),
      knob('rate', 'Rate', { value: 4, min: 1, max: 8, unit: '/beat', step: 1 }),
      knob('trim', 'Level', { value: 1.55, min: 0, max: 2.5, locked: true }),
    ],
    [
      'note.gate>clock.reset',
      'rate.out>clock.param:rate',
      'clock.out>chance.clock:in',
      'feel.x>chance.pass:a',
      'feel.y>env.param:decay',
      'feel.y>env.param:release',
      'clock.out>colour.roll',
      'clock.out>touch.roll',
      'colour.out>hp.param:cutoff',
      'noise.out>hp.in',
      'chance.gate:out>env.gate',
      ...fall.wires,
      'envShape.out>loud.a',
      'touch.out>loud.b',
      'hp.out>vca.in',
      'loud.out>vca.cv',
      'note.gate>on.gate',
      'vca.out>hold.in',
      'on.out>scene.a',
      'note.velocity>scene.b',
      'scene.out>hold.cv',
      'hold.out>level.in',
      'trim.out>level.param:gain',
      'level.out>out.in',
    ],
    { prefix: 'n_', modules },
  )
}

/** Plays whatever notes arrive as a Mallet: the arp track, whose notes come from the pad through its note graph. */
export const arpPatch = (modules: ModuleLibrary): Patch =>
  patchOf(
    [
      { id: 'note', type: 'note' },
      useModule('mallet', MALLET, { 'ratio:value': 2, 'index:value': 1.6, 'decay:value': 0.42 }, 'Mallet'),
      { id: 'out', type: 'output' },
      knob('level', 'Level', { value: 0.5, min: 0, max: 1.5, locked: true }),
    ],
    ['level.out>mallet.out:param:gain', 'note.frequency>mallet.pitch:in', 'note.gate>mallet.gate:in', 'note.velocity>mallet.loud:b', 'mallet.out:out>out.in'],
    { prefix: 'n_', modules },
  )

