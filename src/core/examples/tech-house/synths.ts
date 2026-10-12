import type { ModuleLibrary, Patch } from '../../patch'
import { type NodeSpec, knob, led, patchOf, useModule } from '../builder'
import { ORGAN, SOFT_CLIP } from './modules'

/**
 * The pitched voices of "Low Light": a bass, an organ stab, a plucked arpeggio voice, a drone, a riser and some dust. Like the
 * drums they are plain node graphs with their controls laid out for the panel: open a track's Instrument tab and press Panel.
 */

/** An envelope multiplied by itself, for a pluck that falls fast and rings a long time. */
const squared = (env: string, shape: string, name: string): { node: NodeSpec; wires: string[] } => ({
  node: { id: shape, type: 'multiply', name },
  wires: [`${env}.out>${shape}.a`, `${env}.out>${shape}.b`],
})

/**
 * The bass: a sine for the weight, and a little saw through a low-pass whose cutoff is plucked open by an envelope, for the bite
 * that carries it. Soft-clipped, so it holds its own on a small speaker. Short notes on the off-beat do the rest.
 */
export const bassPatch = (modules: ModuleLibrary): Patch =>
  patchOf(
    [
      { id: 'note', type: 'note' },
      { id: 'sub', type: 'oscillator', name: 'Sub', params: { waveform: 0 } },
      { id: 'subVca', type: 'gain', name: 'Sub level' },
      { id: 'saw', type: 'oscillator', name: 'Saw', params: { waveform: 1 } },
      { id: 'filtEnv', type: 'envelope', name: 'Pluck', params: { attack: 0.002, decay: 0.2, sustain: 0.08, release: 0.1 } },
      { id: 'filt', type: 'filter', name: 'Bite filter', params: { mode: 0, cutoff: 240, resonance: 2.2, cvAmount: 1.7 } },
      { id: 'biteVca', type: 'gain', name: 'Bite level' },
      { id: 'mix', type: 'gain', name: 'Mix' },
      { id: 'ampEnv', type: 'envelope', name: 'Note', params: { attack: 0.004, decay: 0.16, sustain: 0.6, release: 0.07 } },
      { id: 'amp', type: 'gain', name: 'Note shape' },
      useModule('sat', SOFT_CLIP, { 'drive:value': 1.15 }, 'Drive'),
      { id: 'level', type: 'gain', name: 'Level' },
      { id: 'out', type: 'output' },
      knob('cutoff', 'Cutoff', { value: 240, min: 70, max: 1500, unit: 'Hz', curve: 'log' }),
      knob('pluck', 'Pluck', { value: 1.7, min: 0, max: 4, unit: 'oct', step: 0.05 }),
      knob('reso', 'Resonance', { value: 2.2, min: 0.5, max: 9, curve: 'log' }),
      knob('subAmt', 'Sub', { value: 0.8, min: 0, max: 1.3 }),
      knob('biteAmt', 'Bite', { value: 0.3, min: 0, max: 1 }),
      knob('decay', 'Decay', { value: 0.2, min: 0.04, max: 0.7, unit: 's', curve: 'log' }),
      knob('trim', 'Level', { value: 0.62, min: 0, max: 1, locked: true }),
    ],
    [
      'note.frequency>sub.freq',
      'note.frequency>saw.freq',
      'note.gate>filtEnv.gate',
      'note.gate>ampEnv.gate',
      'sub.out>subVca.in',
      'subAmt.out>subVca.param:gain',
      'saw.out>filt.in',
      'filtEnv.out>filt.cutoff',
      'cutoff.out>filt.param:cutoff',
      'pluck.out>filt.param:cvAmount',
      'reso.out>filt.param:resonance',
      'decay.out>filtEnv.param:decay',
      'filt.out>biteVca.in',
      'biteAmt.out>biteVca.param:gain',
      'subVca.out>mix.in',
      'biteVca.out>mix.in',
      'mix.out>amp.in',
      'ampEnv.out>amp.cv',
      'amp.out>sat.pre:in',
      'sat.makeup:out>level.in',
      'trim.out>level.param:gain',
      'level.out>out.in',
    ],
    { prefix: 'n_', modules },
  )

/**
 * The stab: an organ (five drawbars, in the Organ module) with a touch of vibrato, through a low-pass that an envelope snaps open
 * and a slow Perlin wander keeps moving, so no two stabs of a long loop are quite the same.
 */
export const stabPatch = (modules: ModuleLibrary): Patch =>
  patchOf(
    [
      { id: 'note', type: 'note' },
      { id: 'vibrato', type: 'lfo', name: 'Vibrato', params: { shape: 0, rate: 5.6, depth: 0.0035 } },
      { id: 'vibAdd', type: 'add', name: '1 plus vibrato', params: { a: 1 } },
      { id: 'vibMul', type: 'multiply', name: 'Pitch with vibrato' },
      useModule('organ', ORGAN, {}, 'Organ'),
      { id: 'filtEnv', type: 'envelope', name: 'Snap', params: { attack: 0.002, decay: 0.13, sustain: 0.1, release: 0.1 } },
      { id: 'drift', type: 'perlin', name: 'Drift', params: { rate: 0.35, octaves: 2, persistence: 0.5, depth: 1, seed: 7 } },
      { id: 'driftAmt', type: 'multiply', name: 'Drift amount' },
      { id: 'filt', type: 'filter', name: 'Tone filter', params: { mode: 0, cutoff: 1500, resonance: 1.3, cvAmount: 1.6 } },
      { id: 'ampEnv', type: 'envelope', name: 'Stab', params: { attack: 0.003, decay: 0.15, sustain: 0.18, release: 0.14 } },
      { id: 'amp', type: 'gain', name: 'Stab shape' },
      { id: 'level', type: 'gain', name: 'Level' },
      { id: 'out', type: 'output' },
      knob('tone', 'Tone', { value: 1500, min: 250, max: 8000, unit: 'Hz', curve: 'log' }),
      knob('snap', 'Snap', { value: 1.6, min: 0, max: 4, unit: 'oct', step: 0.05 }),
      knob('reso', 'Resonance', { value: 1.3, min: 0.5, max: 8, curve: 'log' }),
      knob('driftDepth', 'Drift', { value: 0.9, min: 0, max: 2 }),
      knob('decay', 'Length', { value: 0.15, min: 0.04, max: 0.8, unit: 's', curve: 'log' }),
      knob('trim', 'Level', { value: 0.6, min: 0, max: 1, locked: true }),
    ],
    [
      'note.gate>filtEnv.gate',
      'note.gate>ampEnv.gate',
      'vibrato.out>vibAdd.b',
      'vibAdd.out>vibMul.b',
      'note.frequency>vibMul.a',
      'vibMul.out>organ.pitch:a',
      'organ.sum:out>filt.in',
      'filtEnv.out>filt.cutoff',
      'drift.uni>driftAmt.a',
      'driftDepth.out>driftAmt.b',
      'driftAmt.out>filt.cutoff',
      'tone.out>filt.param:cutoff',
      'snap.out>filt.param:cvAmount',
      'reso.out>filt.param:resonance',
      'decay.out>ampEnv.param:decay',
      'decay.out>filtEnv.param:decay',
      'filt.out>amp.in',
      'ampEnv.out>amp.cv',
      'amp.out>level.in',
      'trim.out>level.param:gain',
      'level.out>out.in',
    ],
    { prefix: 'n_', modules },
  )

/**
 * The arp voice: two slightly detuned oscillators (a saw and a square) through a resonant low-pass that an envelope plucks open,
 * and a pluck-shaped amplitude (an envelope squared). The arpeggiator in the note graph decides what it plays.
 */
export const pluckPatch = (): Patch => {
  const fall = squared('ampEnv', 'ampShape', 'Pluck (squared)')
  return patchOf(
    [
      { id: 'note', type: 'note' },
      { id: 'sawOsc', type: 'oscillator', name: 'Saw', params: { waveform: 1 } },
      { id: 'squareOsc', type: 'oscillator', name: 'Square', params: { waveform: 2 } },
      { id: 'flip', type: 'invert', name: 'Opposite detune' },
      { id: 'mixSaw', type: 'gain', name: 'Saw level', params: { gain: 0.5 } },
      { id: 'mixSquare', type: 'gain', name: 'Square level', params: { gain: 0.32 } },
      { id: 'filtEnv', type: 'envelope', name: 'Pluck', params: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.2 } },
      { id: 'drift', type: 'perlin', name: 'Drift', params: { rate: 0.12, octaves: 2, persistence: 0.5, depth: 1, seed: 17 } },
      { id: 'driftAmt', type: 'multiply', name: 'Drift amount' },
      { id: 'filt', type: 'filter', name: 'Filter', params: { mode: 0, cutoff: 1300, resonance: 2.6, cvAmount: 2.4 } },
      { id: 'ampEnv', type: 'envelope', name: 'Note', params: { attack: 0.002, decay: 0.24, sustain: 0, release: 0.24 } },
      fall.node,
      { id: 'amp', type: 'gain', name: 'Pluck shape' },
      { id: 'level', type: 'gain', name: 'Level' },
      { id: 'out', type: 'output' },
      knob('cutoff', 'Cutoff', { value: 1300, min: 200, max: 9000, unit: 'Hz', curve: 'log' }),
      knob('pluck', 'Pluck', { value: 2.4, min: 0, max: 5, unit: 'oct', step: 0.05 }),
      knob('reso', 'Resonance', { value: 2.6, min: 0.5, max: 12, curve: 'log' }),
      knob('detune', 'Detune', { value: 9, min: 0, max: 40, unit: 'ct', step: 1 }),
      knob('driftDepth', 'Drift', { value: 0.7, min: 0, max: 2 }),
      knob('decay', 'Decay', { value: 0.24, min: 0.05, max: 0.9, unit: 's', curve: 'log' }),
      knob('trim', 'Level', { value: 0.5, min: 0, max: 1, locked: true }),
    ],
    [
      'note.frequency>sawOsc.freq',
      'note.frequency>squareOsc.freq',
      'detune.out>sawOsc.param:detune',
      'detune.out>flip.in',
      'flip.out>squareOsc.param:detune',
      'sawOsc.out>mixSaw.in',
      'squareOsc.out>mixSquare.in',
      'mixSaw.out>filt.in',
      'mixSquare.out>filt.in',
      'note.gate>filtEnv.gate',
      'note.gate>ampEnv.gate',
      'filtEnv.out>filt.cutoff',
      'drift.uni>driftAmt.a',
      'driftDepth.out>driftAmt.b',
      'driftAmt.out>filt.cutoff',
      'cutoff.out>filt.param:cutoff',
      'pluck.out>filt.param:cvAmount',
      'reso.out>filt.param:resonance',
      'decay.out>ampEnv.param:decay',
      'decay.out>ampEnv.param:release',
      'decay.out>filtEnv.param:decay',
      'decay.out>filtEnv.param:release',
      ...fall.wires,
      'filt.out>amp.in',
      'ampShape.out>amp.cv',
      'amp.out>level.in',
      'trim.out>level.param:gain',
      'level.out>out.in',
    ],
    { prefix: 'n_' },
  )
}

/**
 * Tonal percussion: a sine that drops a few semitones as it is struck, plus an inharmonic overtone that dies quicker. It plays the
 * pitch of the note, so a clip of two or three notes is a melody of little wooden knocks.
 */
export const tokPatch = (): Patch => {
  const fall = squared('ampEnv', 'ampShape', 'Knock (squared)')
  return patchOf(
    [
      { id: 'note', type: 'note' },
      { id: 'dropEnv', type: 'envelope', name: 'Drop', params: { attack: 0.001, decay: 0.035, sustain: 0, release: 0.035 } },
      { id: 'body', type: 'oscillator', name: 'Body', params: { waveform: 0, pitchAmount: 5 } },
      { id: 'overtoneRatio', type: 'multiply', name: 'Overtone pitch', params: { b: 2.76 } },
      { id: 'overtone', type: 'oscillator', name: 'Overtone', params: { waveform: 0 } },
      { id: 'overtoneEnv', type: 'envelope', params: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.04 } },
      { id: 'overtoneVca', type: 'gain', name: 'Overtone shape' },
      { id: 'overtoneAmt', type: 'gain', name: 'Overtone level' },
      { id: 'ampEnv', type: 'envelope', params: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.15 } },
      fall.node,
      { id: 'bodyVca', type: 'gain', name: 'Body shape' },
      { id: 'sum', type: 'gain', name: 'Mix' },
      { id: 'level', type: 'gain', name: 'Level' },
      { id: 'out', type: 'output' },
      knob('decay', 'Decay', { value: 0.15, min: 0.04, max: 0.6, unit: 's', curve: 'log' }),
      knob('drop', 'Drop', { value: 5, min: 0, max: 14, unit: 'st', step: 0.1 }),
      knob('overtoneLevel', 'Overtone', { value: 0.35, min: 0, max: 1 }),
      knob('trim', 'Level', { value: 0.55, min: 0, max: 1, locked: true }),
    ],
    [
      'note.frequency>body.freq',
      'note.frequency>overtoneRatio.a',
      'overtoneRatio.out>overtone.freq',
      'note.gate>dropEnv.gate',
      'note.gate>overtoneEnv.gate',
      'note.gate>ampEnv.gate',
      'dropEnv.out>body.pitch',
      'drop.out>body.param:pitchAmount',
      'decay.out>ampEnv.param:decay',
      'decay.out>ampEnv.param:release',
      ...fall.wires,
      'body.out>bodyVca.in',
      'ampShape.out>bodyVca.cv',
      'overtone.out>overtoneVca.in',
      'overtoneEnv.out>overtoneVca.cv',
      'overtoneVca.out>overtoneAmt.in',
      'overtoneAmt.out>sum.in',
      'overtoneLevel.out>overtoneAmt.param:gain',
      'bodyVca.out>sum.in',
      'sum.out>level.in',
      'trim.out>level.param:gain',
      'level.out>out.in',
    ],
    { prefix: 'n_' },
  )
}

/**
 * The drone under the breakdown: a pair of detuned saws and a sine an octave down, through a dark filter that a very slow Perlin
 * wander opens and closes. A slow envelope fades each note in and out.
 */
export const dronePatch = (): Patch =>
  patchOf(
    [
      { id: 'note', type: 'note' },
      { id: 'sawA', type: 'oscillator', name: 'Saw left', params: { waveform: 1, detune: -11 } },
      { id: 'sawB', type: 'oscillator', name: 'Saw right', params: { waveform: 1, detune: 11 } },
      { id: 'sub', type: 'oscillator', name: 'Octave down', params: { waveform: 0, detune: -1200 } },
      { id: 'sawMix', type: 'gain', name: 'Saws', params: { gain: 0.3 } },
      { id: 'subMix', type: 'gain', name: 'Sub', params: { gain: 0.5 } },
      { id: 'wander', type: 'perlin', name: 'Wander', params: { rate: 0.09, octaves: 2, persistence: 0.45, depth: 1, seed: 31 } },
      { id: 'wanderAmt', type: 'multiply', name: 'Wander amount' },
      { id: 'filt', type: 'filter', name: 'Dark filter', params: { mode: 0, cutoff: 520, resonance: 1.1, cvAmount: 1 } },
      { id: 'ampEnv', type: 'envelope', name: 'Swell', params: { attack: 1.6, decay: 1, sustain: 0.85, release: 2.4 } },
      { id: 'amp', type: 'gain', name: 'Swell shape' },
      { id: 'level', type: 'gain', name: 'Level' },
      { id: 'out', type: 'output' },
      knob('warmth', 'Warmth', { value: 520, min: 150, max: 4000, unit: 'Hz', curve: 'log' }),
      knob('motion', 'Motion', { value: 1.4, min: 0, max: 3, unit: 'oct', step: 0.05 }),
      knob('trim', 'Level', { value: 0.55, min: 0, max: 1, locked: true }),
    ],
    [
      'note.frequency>sawA.freq',
      'note.frequency>sawB.freq',
      'note.frequency>sub.freq',
      'sawA.out>sawMix.in',
      'sawB.out>sawMix.in',
      'sub.out>subMix.in',
      'sawMix.out>filt.in',
      'subMix.out>filt.in',
      'wander.out>filt.cutoff',
      'warmth.out>filt.param:cutoff',
      'motion.out>filt.param:cvAmount',
      'note.gate>ampEnv.gate',
      'filt.out>amp.in',
      'ampEnv.out>amp.cv',
      'amp.out>level.in',
      'trim.out>level.param:gain',
      'level.out>out.in',
    ],
    { prefix: 'n_' },
  )

/**
 * The riser: white noise through a high-pass whose cutoff an envelope sweeps up over almost two bars, under a sine that climbs
 * with it. One two-bar note per build.
 */
export const riserPatch = (): Patch => {
  const swell = squared('rise', 'riseShape', 'Swell (squared)')
  return patchOf(
    [
      { id: 'note', type: 'note' },
      { id: 'rise', type: 'envelope', name: 'Rise', params: { attack: 3.8, decay: 0.02, sustain: 1, release: 0.12 } },
      swell.node,
      { id: 'noise', type: 'noise', params: { colour: 0, level: 1, seed: 41 } },
      { id: 'filt', type: 'filter', name: 'Sweep', params: { mode: 1, cutoff: 260, resonance: 1.4, cvAmount: 5 } },
      { id: 'whoosh', type: 'gain', name: 'Whoosh' },
      { id: 'whine', type: 'oscillator', name: 'Whine', params: { waveform: 0, frequency: 330, pitchAmount: 24 } },
      { id: 'whineVca', type: 'gain', name: 'Whine level', params: { gain: 0.12 } },
      { id: 'sum', type: 'gain', name: 'Mix' },
      { id: 'amp', type: 'gain', name: 'Swell shape' },
      { id: 'level', type: 'gain', name: 'Level' },
      { id: 'out', type: 'output' },
      knob('sweep', 'Sweep', { value: 5, min: 1, max: 7, unit: 'oct', step: 0.1 }),
      knob('whineAmt', 'Whine', { value: 0.12, min: 0, max: 0.4 }),
      knob('trim', 'Level', { value: 0.5, min: 0, max: 1, locked: true }),
    ],
    [
      'note.gate>rise.gate',
      ...swell.wires,
      'noise.out>filt.in',
      'rise.out>filt.cutoff',
      'sweep.out>filt.param:cvAmount',
      'filt.out>whoosh.in',
      'rise.out>whine.pitch',
      'whine.out>whineVca.in',
      'whineAmt.out>whineVca.param:gain',
      'whoosh.out>sum.in',
      'whineVca.out>sum.in',
      'sum.out>amp.in',
      'riseShape.out>amp.cv',
      'amp.out>level.in',
      'trim.out>level.param:gain',
      'level.out>out.in',
    ],
    { prefix: 'n_' },
  )
}

/** Dust: random clicks like a worn record, from a Geiger node, so quiet it is felt more than heard. */
export const dustPatch = (): Patch =>
  patchOf(
    [
      { id: 'note', type: 'note' },
      { id: 'dust', type: 'geiger', name: 'Dust', params: { rate: 14, decay: 0.9, spread: 0.85, seed: 5 } },
      { id: 'air', type: 'filter', name: 'Air only', params: { mode: 1, cutoff: 3500, resonance: 0.7 } },
      { id: 'ampEnv', type: 'envelope', params: { attack: 0.05, decay: 0.1, sustain: 1, release: 0.15 } },
      { id: 'amp', type: 'gain', name: 'On while held' },
      { id: 'level', type: 'gain', name: 'Level' },
      { id: 'out', type: 'output' },
      knob('crackle', 'Crackle', { value: 14, min: 0, max: 80, unit: '/s', curve: 'exp' }),
      knob('bright', 'Brightness', { value: 3500, min: 800, max: 12000, unit: 'Hz', curve: 'log' }),
      knob('trim', 'Level', { value: 0.3, min: 0, max: 1, locked: true }),
      led('tick', 'Tick', { threshold: 0.5, colour: 'blue' }),
    ],
    [
      'note.gate>ampEnv.gate',
      'dust.click>air.in',
      'dust.trigger>tick.in',
      'crackle.out>dust.param:rate',
      'bright.out>air.param:cutoff',
      'air.out>amp.in',
      'ampEnv.out>amp.cv',
      'amp.out>level.in',
      'trim.out>level.param:gain',
      'level.out>out.in',
    ],
    { prefix: 'n_' },
  )
