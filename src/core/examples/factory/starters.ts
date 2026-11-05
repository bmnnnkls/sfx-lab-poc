import type { Patch } from '../../patch'
import type { Project } from '../../project'
import { knob, patchOf } from '../builder'
import { type InstrumentSpec, projectOf } from '../tracks'

/**
 * The Factory's starters: plain sounds to begin from, written down with the examples' DSL and their rules (every node but the
 * knobs locked, musical knob ranges, no samples). Each lives on a track of a small project of its own, so the Factory captures it
 * the way it captures the examples' sounds: by owner and graph.
 */

/** A saw through a low-pass that an envelope opens, and an amplitude envelope: the synth every tutorial starts with. */
const basicSynth = (): Patch =>
  patchOf(
    [
      { id: 'note', type: 'note' },
      { id: 'osc', type: 'oscillator', name: 'Saw', params: { waveform: 1 } },
      { id: 'filtEnv', type: 'envelope', name: 'Filter envelope', params: { attack: 0.005, decay: 0.35, sustain: 0.2, release: 0.3 } },
      { id: 'filt', type: 'filter', name: 'Low-pass', params: { mode: 0, cutoff: 600, resonance: 2, cvAmount: 2.5 } },
      { id: 'ampEnv', type: 'envelope', name: 'Amp envelope', params: { attack: 0.005, decay: 0.3, sustain: 0.7, release: 0.3 } },
      { id: 'amp', type: 'gain', name: 'Note shape' },
      { id: 'level', type: 'gain', name: 'Level', params: { gain: 0.45 } },
      { id: 'out', type: 'output' },
      knob('cutoff', 'Cutoff', { value: 600, min: 80, max: 8000, unit: 'Hz', curve: 'log' }),
      knob('reso', 'Resonance', { value: 2, min: 0.5, max: 10, curve: 'log' }),
      knob('envAmt', 'Envelope', { value: 2.5, min: 0, max: 5, unit: 'oct', step: 0.05 }),
      knob('decay', 'Decay', { value: 0.35, min: 0.05, max: 2, unit: 's', curve: 'log' }),
      knob('release', 'Release', { value: 0.3, min: 0.02, max: 3, unit: 's', curve: 'log' }),
    ],
    [
      'note.frequency>osc.freq',
      'note.gate>filtEnv.gate',
      'note.gate>ampEnv.gate',
      'osc.out>filt.in',
      'filtEnv.out>filt.cutoff',
      'cutoff.out>filt.param:cutoff',
      'reso.out>filt.param:resonance',
      'envAmt.out>filt.param:cvAmount',
      'decay.out>filtEnv.param:decay',
      'release.out>ampEnv.param:release',
      'filt.out>amp.in',
      'ampEnv.out>amp.cv',
      'amp.out>level.in',
      'level.out>out.in',
    ],
    { prefix: 'n_' },
  )

/**
 * Two-operator FM: a modulator at `Ratio` times the pitch bends the pitch of a sine carrier, by an amount (the index) that falls
 * with an envelope, so the note strikes bright and rings out pure.
 */
const fmBell = (): Patch =>
  patchOf(
    [
      { id: 'note', type: 'note' },
      { id: 'modPitch', type: 'multiply', name: 'Modulator pitch' },
      { id: 'mod', type: 'oscillator', name: 'Modulator', params: { waveform: 0 } },
      { id: 'indexHz', type: 'multiply', name: 'Index in Hz' },
      { id: 'indexEnv', type: 'envelope', name: 'Brightness fall', params: { attack: 0.001, decay: 0.6, sustain: 0, release: 0.6 } },
      { id: 'indexNow', type: 'multiply', name: 'Index over time' },
      { id: 'wobble', type: 'multiply', name: 'Modulation' },
      { id: 'carrierPitch', type: 'add', name: 'Carrier pitch' },
      { id: 'carrier', type: 'oscillator', name: 'Carrier', params: { waveform: 0 } },
      { id: 'ampEnv', type: 'envelope', name: 'Ring', params: { attack: 0.001, decay: 1.6, sustain: 0, release: 1.6 } },
      { id: 'amp', type: 'gain', name: 'Note shape' },
      { id: 'level', type: 'gain', name: 'Level', params: { gain: 0.4 } },
      { id: 'out', type: 'output' },
      knob('ratio', 'Ratio', { value: 3.5, min: 0.5, max: 8, curve: 'log' }),
      knob('index', 'Bright', { value: 2, min: 0, max: 6 }),
      knob('fall', 'Brightness fall', { value: 0.6, min: 0.05, max: 3, unit: 's', curve: 'log' }),
      knob('ring', 'Ring', { value: 1.6, min: 0.2, max: 5, unit: 's', curve: 'log' }),
    ],
    [
      'note.frequency>modPitch.a',
      'ratio.out>modPitch.b',
      'modPitch.out>mod.freq',
      'note.frequency>indexHz.a',
      'index.out>indexHz.b',
      'note.gate>indexEnv.gate',
      'fall.out>indexEnv.param:decay',
      'fall.out>indexEnv.param:release',
      'indexHz.out>indexNow.a',
      'indexEnv.out>indexNow.b',
      'mod.out>wobble.a',
      'indexNow.out>wobble.b',
      'note.frequency>carrierPitch.a',
      'wobble.out>carrierPitch.b',
      'carrierPitch.out>carrier.freq',
      'note.gate>ampEnv.gate',
      'ring.out>ampEnv.param:decay',
      'ring.out>ampEnv.param:release',
      'carrier.out>amp.in',
      'ampEnv.out>amp.cv',
      'amp.out>level.in',
      'level.out>out.in',
    ],
    { prefix: 'n_' },
  )

/** White noise through a resonant band-pass that an envelope sweeps up while the note is held: a whoosh, a riser, wind. */
const noiseSweep = (): Patch =>
  patchOf(
    [
      { id: 'note', type: 'note' },
      { id: 'noise', type: 'noise', name: 'Noise', params: { colour: 0, level: 0.8, seed: 7 } },
      { id: 'sweepEnv', type: 'envelope', name: 'Sweep', params: { attack: 1.2, decay: 0.2, sustain: 1, release: 0.6 } },
      { id: 'filt', type: 'filter', name: 'Band-pass', params: { mode: 2, cutoff: 300, resonance: 4, cvAmount: 4 } },
      { id: 'ampEnv', type: 'envelope', name: 'Amp envelope', params: { attack: 0.3, decay: 0.2, sustain: 1, release: 0.6 } },
      { id: 'amp', type: 'gain', name: 'Note shape' },
      { id: 'level', type: 'gain', name: 'Level', params: { gain: 0.5 } },
      { id: 'out', type: 'output' },
      knob('from', 'From', { value: 300, min: 60, max: 3000, unit: 'Hz', curve: 'log' }),
      knob('reach', 'Sweep', { value: 4, min: 0, max: 6, unit: 'oct', step: 0.05 }),
      knob('time', 'Sweep time', { value: 1.2, min: 0.05, max: 4, unit: 's', curve: 'log' }),
      knob('reso', 'Resonance', { value: 4, min: 0.5, max: 12, curve: 'log' }),
    ],
    [
      'note.gate>sweepEnv.gate',
      'note.gate>ampEnv.gate',
      'noise.out>filt.in',
      'sweepEnv.out>filt.cutoff',
      'from.out>filt.param:cutoff',
      'reach.out>filt.param:cvAmount',
      'reso.out>filt.param:resonance',
      'time.out>sweepEnv.param:attack',
      'filt.out>amp.in',
      'ampEnv.out>amp.cv',
      'amp.out>level.in',
      'level.out>out.in',
    ],
    { prefix: 'n_' },
  )

/** A sine for the weight, with a touch of its octave so it still shows on a small speaker. */
const sineSub = (): Patch =>
  patchOf(
    [
      { id: 'note', type: 'note' },
      { id: 'sine', type: 'oscillator', name: 'Sine', params: { waveform: 0 } },
      { id: 'octavePitch', type: 'multiply', name: 'An octave up', params: { b: 2 } },
      { id: 'octave', type: 'oscillator', name: 'Octave', params: { waveform: 0 } },
      { id: 'octaveVca', type: 'gain', name: 'Octave level' },
      { id: 'mix', type: 'gain', name: 'Mix' },
      { id: 'ampEnv', type: 'envelope', name: 'Amp envelope', params: { attack: 0.004, decay: 0.3, sustain: 0.85, release: 0.12 } },
      { id: 'amp', type: 'gain', name: 'Note shape' },
      { id: 'level', type: 'gain', name: 'Level', params: { gain: 0.6 } },
      { id: 'out', type: 'output' },
      knob('harmonic', 'Octave', { value: 0.2, min: 0, max: 0.6 }),
      knob('release', 'Release', { value: 0.12, min: 0.02, max: 1.5, unit: 's', curve: 'log' }),
    ],
    [
      'note.frequency>sine.freq',
      'note.frequency>octavePitch.a',
      'octavePitch.out>octave.freq',
      'octave.out>octaveVca.in',
      'harmonic.out>octaveVca.param:gain',
      'sine.out>mix.in',
      'octaveVca.out>mix.in',
      'note.gate>ampEnv.gate',
      'release.out>ampEnv.param:release',
      'mix.out>amp.in',
      'ampEnv.out>amp.cv',
      'amp.out>level.in',
      'level.out>out.in',
    ],
    { prefix: 'n_' },
  )

/** Track in -> a delay locked to the tempo (a quarter note), mixed in -> Track out. */
const syncedDelay = (): Patch =>
  patchOf(
    [
      { id: 'in', type: 'trackIn' },
      { id: 'delay', type: 'delay', name: 'Quarter note', stereo: true, params: { time: 1, feedback: 0.4, mix: 0.3, sync: 1, division: 10 } },
      { id: 'tone', type: 'filter', name: 'Darken', stereo: true, params: { mode: 0, cutoff: 7000, resonance: 0.7 } },
      { id: 'out', type: 'trackOut' },
      knob('feedback', 'Feedback', { value: 0.4, min: 0, max: 0.85 }),
      knob('mix', 'Mix', { value: 0.3, min: 0, max: 1 }),
      knob('darken', 'Darken', { value: 7000, min: 800, max: 18000, unit: 'Hz', curve: 'log' }),
    ],
    ['in.out>delay.in', 'feedback.out>delay.param:feedback', 'mix.out>delay.param:mix', 'delay.out>tone.in', 'darken.out>tone.param:cutoff', 'tone.out>out.in'],
    { prefix: 'fx_' },
  )

/** Track in -> a high-pass -> Track out: clears the low end out of what doesn't need it. */
const lowCut = (): Patch =>
  patchOf(
    [
      { id: 'in', type: 'trackIn' },
      { id: 'hp', type: 'filter', name: 'Low cut', stereo: true, params: { mode: 1, cutoff: 150, resonance: 0.7 } },
      { id: 'out', type: 'trackOut' },
      knob('cutoff', 'Low cut', { value: 150, min: 20, max: 1200, unit: 'Hz', curve: 'log' }),
      knob('reso', 'Resonance', { value: 0.7, min: 0.5, max: 4, curve: 'log' }),
    ],
    ['in.out>hp.in', 'cutoff.out>hp.param:cutoff', 'reso.out>hp.param:resonance', 'hp.out>out.in'],
    { prefix: 'fx_' },
  )

/** Track in -> mid/side width -> Track out: 0 is mono, 1 as it is, 2 twice as wide. */
const widener = (): Patch =>
  patchOf(
    [
      { id: 'in', type: 'trackIn' },
      { id: 'width', type: 'width', name: 'Width', params: { width: 1.4 } },
      { id: 'out', type: 'trackOut' },
      knob('amount', 'Width', { value: 1.4, min: 0, max: 2 }),
    ],
    ['in.out>width.in', 'amount.out>width.param:width', 'width.out>out.in'],
    { prefix: 'fx_' },
  )

const masterThrough = (): Patch => patchOf([{ id: 'in', type: 'masterIn' }, { id: 'out', type: 'trackOut' }], ['in.out>out.in'], { prefix: 'master_' })

/** The track ids the starters live on, which the Factory's table names as their owners. */
export const STARTER_TRACKS = ['basic-synth', 'fm-bell', 'noise-sweep', 'sine-sub', 'synced-delay', 'low-cut', 'widener'] as const

/** A project holding the starters: each instrument on its own track, and each effect in a track's effects (over a sine). */
export const createStarters = (): Project => {
  const instrument = (id: string, name: string, patch: Patch): InstrumentSpec => ({ id, name, patch, clips: {} })
  const effect = (id: string, name: string, fx: Patch): InstrumentSpec => ({ id, name, patch: sineSub(), fx, clips: {} })
  return projectOf({
    name: 'Starters',
    tempo: 120,
    sceneCount: 1,
    sceneNames: ['Start'],
    modules: [],
    master: { fx: masterThrough() },
    tracks: [
      instrument('basic-synth', 'Basic synth', basicSynth()),
      instrument('fm-bell', 'FM bell', fmBell()),
      instrument('noise-sweep', 'Noise sweep', noiseSweep()),
      instrument('sine-sub', 'Sine sub', sineSub()),
      effect('synced-delay', 'Synced delay', syncedDelay()),
      effect('low-cut', 'Low cut', lowCut()),
      effect('widener', 'Widener', widener()),
    ],
    returns: [],
  })
}
