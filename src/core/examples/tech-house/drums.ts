import type { ModuleLibrary, Patch } from '../../patch'
import { type NodeSpec, knob, led, patchOf, useModule } from '../builder'
import { NOISE_HIT, SOFT_CLIP } from './modules'

/**
 * The drum voices of "Low Light". None of them is a recording: each is a handful of nodes, so every sound on the kit has knobs
 * to turn (and the panel shows them).
 *
 * Two tricks they share. The envelope node is linear, so multiplying it by itself bends the fall into something much closer to
 * how a drum decays (fast at first, a long tail after). And an envelope's release is set equal to its decay, so a hit rings out
 * its whole length however short the note is.
 */

/** An envelope multiplied by itself: wires `<env>.out` into both inputs of a multiply called `<shape>`. */
const squared = (env: string, shape: string): { node: NodeSpec; wires: string[] } => ({
  node: { id: shape, type: 'multiply', name: `${env === 'ampEnv' ? 'Fall' : 'Dive'} (squared)` },
  wires: [`${env}.out>${shape}.a`, `${env}.out>${shape}.b`],
})

/**
 * The kick, built the way an analog drum machine does it: a short impulse rings a resonant low-pass filter, and the filter's cutoff
 * dives. The ring is a sine that starts the same way on every hit (an oscillator would carry its phase from the last hit over and
 * attack differently each time), and it dies away by itself, so the tail is a natural decay.
 */
export const kickPatch = (modules: ModuleLibrary): Patch => {
  const fall = squared('ampEnv', 'ampShape')
  const dive = squared('diveEnv', 'diveShape')
  return patchOf(
    [
      { id: 'note', type: 'note' },
      // The knock: a 2 ms pulse, the same on every hit.
      { id: 'pulseEnv', type: 'envelope', name: 'Impulse', params: { attack: 0.001, decay: 0.0015, sustain: 0, release: 0.001 } },
      { id: 'pulseGain', type: 'gain', name: 'Impulse strength', params: { gain: 2 } },
      // The ring: a low-pass tuned to the kick, with a lot of resonance. `Tune` is where it settles, `Punch` how far its cutoff starts above that.
      { id: 'diveEnv', type: 'envelope', name: 'Dive time', params: { attack: 0.001, decay: 0.07, sustain: 0, release: 0.07 } },
      dive.node,
      { id: 'ring', type: 'filter', name: 'Ring', params: { mode: 0, cutoff: 55, resonance: 7 } },
      { id: 'ampEnv', type: 'envelope', name: 'Length', params: { attack: 0.001, decay: 0.42, sustain: 0, release: 0.42 } },
      fall.node,
      { id: 'tail', type: 'gain', name: 'Tail' },
      // The beater: a few milliseconds of high noise.
      { id: 'clickNoise', type: 'noise', name: 'Beater', params: { colour: 0, level: 1, seed: 11 } },
      { id: 'clickHp', type: 'filter', name: 'Beater tone', params: { mode: 1, cutoff: 3200, resonance: 0.9 } },
      { id: 'clickEnv', type: 'envelope', name: 'Beater time', params: { attack: 0.001, decay: 0.012, sustain: 0, release: 0.012 } },
      { id: 'clickVca', type: 'gain', name: 'Beater level' },
      { id: 'sum', type: 'gain', name: 'Mix' },
      useModule('sat', SOFT_CLIP, { 'drive:value': 1.5 }, 'Saturator'),
      { id: 'level', type: 'gain', name: 'Level' },
      { id: 'out', type: 'output' },
      // The panel.
      knob('tune', 'Tune', { value: 55, min: 38, max: 80, unit: 'Hz', curve: 'log' }),
      knob('punch', 'Punch', { value: 1.5, min: 0, max: 3, unit: 'oct', step: 0.05 }),
      knob('ringQ', 'Ring', { value: 7, min: 2, max: 16, curve: 'log' }),
      knob('decay', 'Length', { value: 0.42, min: 0.15, max: 0.9, unit: 's', curve: 'log' }),
      knob('click', 'Click', { value: 0.3, min: 0, max: 1 }),
      knob('trim', 'Level', { value: 1.05, min: 0, max: 1.4, locked: true }),
      led('beat', 'Hit', { threshold: 0.5, colour: 'amber' }),
    ],
    [
      'note.gate>pulseEnv.gate',
      'note.gate>diveEnv.gate',
      'note.gate>ampEnv.gate',
      'note.gate>clickEnv.gate',
      'note.gate>beat.in',
      ...dive.wires,
      ...fall.wires,
      'pulseEnv.out>pulseGain.in',
      'pulseGain.out>ring.in',
      'diveShape.out>ring.cutoff',
      'tune.out>ring.param:cutoff',
      'punch.out>ring.param:cvAmount',
      'ringQ.out>ring.param:resonance',
      'ring.out>tail.in',
      'ampShape.out>tail.cv',
      'decay.out>ampEnv.param:decay',
      'decay.out>ampEnv.param:release',
      'clickNoise.out>clickHp.in',
      'clickHp.out>clickVca.in',
      'clickEnv.out>clickVca.cv',
      'click.out>clickVca.param:gain',
      'tail.out>sum.in',
      'clickVca.out>sum.in',
      'sum.out>sat.pre:in',
      'sat.makeup:out>level.in',
      'trim.out>level.param:gain',
      'level.out>out.in',
    ],
    { prefix: 'n_', modules },
  )
}

export interface NoiseVoiceSettings {
  /** The filter: 0 low-pass, 1 high-pass, 2 band-pass. */
  readonly filter: 0 | 1 | 2
  readonly seed: number
  readonly tone: number
  readonly body: number
  readonly decay: number
  readonly metal: number
  readonly level: number
  /** What the knobs may reach: each voice has a range that makes sense for it, so turning a knob (or Randomize) cannot leave the voice. */
  readonly range: { readonly tone: readonly [number, number]; readonly body: readonly [number, number]; readonly decay: readonly [number, number]; readonly metal: readonly [number, number] }
}

/**
 * A voice made of the noise-hit module: gate and velocity from the note, and a knob for each of its inputs, laid out on the panel. The
 * use of the module is locked, so Randomize moves the knobs and cannot swap the filter or the noise; the level is locked too.
 */
export const noiseVoicePatch = (modules: ModuleLibrary, name: string, v: NoiseVoiceSettings): Patch =>
  patchOf(
    [
      { id: 'note', type: 'note' },
      { ...useModule('hit', NOISE_HIT, { 'filt:mode': v.filter, 'noise:seed': v.seed }, name), locked: true },
      { id: 'out', type: 'output' },
      knob('tone', 'Tone', { value: v.tone, min: v.range.tone[0], max: v.range.tone[1], unit: 'Hz', curve: 'log' }),
      knob('body', 'Body', { value: v.body, min: v.range.body[0], max: v.range.body[1], curve: 'log' }),
      knob('decay', 'Decay', { value: v.decay, min: v.range.decay[0], max: v.range.decay[1], unit: 's', curve: 'log' }),
      knob('metal', 'Metal', { value: v.metal, min: v.range.metal[0], max: v.range.metal[1] }),
      knob('level', 'Level', { value: v.level, min: 0, max: 1.5, locked: true }),
    ],
    [
      'note.gate>hit.env:gate',
      'note.velocity>hit.hardness:b',
      'tone.out>hit.filt:param:cutoff',
      'body.out>hit.filt:param:resonance',
      'decay.out>hit.time:in',
      'metal.out>hit.metals:param:gain',
      'level.out>hit.out:param:gain',
      'hit.out:out>out.in',
    ],
    { prefix: 'n_', modules },
  )

/** Closed hat: a tick of high noise, short enough to sit on every sixteenth. */
export const hatPatch = (modules: ModuleLibrary): Patch =>
  noiseVoicePatch(modules, 'Closed hat', { filter: 1, seed: 21, tone: 7800, body: 0.8, decay: 0.042, metal: 0.55, level: 0.55, range: { tone: [5000, 14000], body: [0.5, 1.6], decay: [0.02, 0.16], metal: [0, 1] } })

/** Open hat: the same noise left to ring, a little darker. */
export const openHatPatch = (modules: ModuleLibrary): Patch =>
  noiseVoicePatch(modules, 'Open hat', { filter: 1, seed: 22, tone: 6200, body: 0.9, decay: 0.2, metal: 0.6, level: 0.4, range: { tone: [4000, 12000], body: [0.5, 1.6], decay: [0.1, 0.6], metal: [0, 1] } })

/** Shaker: a band of mid-high noise, softer and longer than the hat. */
export const shakerPatch = (modules: ModuleLibrary): Patch =>
  noiseVoicePatch(modules, 'Shaker', { filter: 2, seed: 23, tone: 5200, body: 1.1, decay: 0.07, metal: 0, level: 0.4, range: { tone: [3000, 9000], body: [0.6, 1.6], decay: [0.03, 0.18], metal: [0, 0.2] } })

/** Clap: a band of mid noise. The clip plays it as three quick hits so it smears like several hands. */
export const clapPatch = (modules: ModuleLibrary): Patch =>
  noiseVoicePatch(modules, 'Clap', { filter: 2, seed: 24, tone: 1250, body: 1.3, decay: 0.16, metal: 0, level: 1.4, range: { tone: [800, 2800], body: [0.7, 1.7], decay: [0.09, 0.24], metal: [0, 0.1] } })
