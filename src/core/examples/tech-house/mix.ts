import type { ModuleLibrary, Patch } from '../../patch'
import { type NodeSpec, knob, meter, patchOf, readout, toggle, useModule } from '../builder'
import { KICK_DUCK } from './modules'

/**
 * The effects graphs of "Low Light": what sits between each track's sound and its fader (the insert graphs), the three return
 * tracks the sends go to, and the master. All of them are ordinary graphs, so each has a Graph | Panel switch in the Effects tab.
 */

const duckUse = (depth: number, release = 150): NodeSpec => useModule('duck', KICK_DUCK, { 'depth:value': depth, 'release:value': release }, 'Duck')

/** Track in -> kick duck -> Track out: the sound dips under every kick. */
export const duckFx = (modules: ModuleLibrary, depth: number, release?: number): Patch =>
  patchOf([{ id: 'in', type: 'trackIn' }, duckUse(depth, release), { id: 'out', type: 'trackOut' }], ['in.out>duck.vca:in', 'duck.vca:out>out.in'], { prefix: 'fx_', modules })

/** The same, with a high-pass first: the stab and the arp keep out of the bass's room. */
export const duckHighpassFx = (modules: ModuleLibrary, depth: number, cutoff: number, release?: number): Patch =>
  patchOf(
    [
      { id: 'in', type: 'trackIn' },
      { id: 'hp', type: 'filter', name: 'Low cut', params: { mode: 1, cutoff, resonance: 0.7 } },
      duckUse(depth, release),
      { id: 'out', type: 'trackOut' },
      knob('low', 'Low cut', { value: cutoff, min: 20, max: 1200, unit: 'Hz', curve: 'log' }),
    ],
    ['in.out>hp.in', 'low.out>hp.param:cutoff', 'hp.out>duck.vca:in', 'duck.vca:out>out.in'],
    { prefix: 'fx_', modules },
  )

/** The drone: a slow auto-pan (a Perlin wander into a Pan node) spreads a mono voice over the stereo field, then the duck. */
export const droneFx = (modules: ModuleLibrary): Patch =>
  patchOf(
    [
      { id: 'in', type: 'trackIn' },
      { id: 'drift', type: 'perlin', name: 'Wander', params: { rate: 0.11, octaves: 2, persistence: 0.4, depth: 1, seed: 13 } },
      { id: 'reach', type: 'multiply', name: 'How far' },
      { id: 'pan', type: 'pan', name: 'Auto-pan' },
      duckUse(0.85, 220),
      { id: 'out', type: 'trackOut' },
      knob('width', 'Auto-pan', { value: 0.55, min: 0, max: 1 }),
    ],
    ['in.out>pan.in', 'drift.out>reach.a', 'width.out>reach.b', 'reach.out>pan.param:pan', 'pan.out>duck.vca:in', 'duck.vca:out>out.in'],
    { prefix: 'fx_', modules },
  )

/** A return: Return in -> high-pass (keeps the mud out) -> Stereo reverb -> Track out. */
export const roomReturn = (): Patch =>
  patchOf(
    [
      { id: 'in', type: 'returnIn' },
      { id: 'hp', type: 'filter', name: 'Low cut', stereo: true, params: { mode: 1, cutoff: 260, resonance: 0.7 } },
      { id: 'verb', type: 'stereoReverb', name: 'Room', params: { size: 0.42, damping: 0.55, predelay: 0.012, mix: 1 } },
      { id: 'out', type: 'trackOut' },
      knob('size', 'Size', { value: 0.42, min: 0.05, max: 0.95 }),
      knob('damp', 'Damping', { value: 0.55, min: 0, max: 1 }),
      knob('low', 'Low cut', { value: 260, min: 40, max: 1200, unit: 'Hz', curve: 'log' }),
    ],
    ['in.out>hp.in', 'low.out>hp.param:cutoff', 'hp.out>verb.in', 'size.out>verb.param:size', 'damp.out>verb.param:damping', 'verb.out>out.in'],
    { prefix: 'fx_' },
  )

/**
 * The dub echo: a ping-pong delay at a dotted eighth (Time in beats, synced to the tempo, so it stays a dotted eighth at any BPM),
 * darkened, ducked under the kick. Hold Throw and the feedback rises to 0.9, so what is in the echo builds instead of dying away.
 */
export const echoReturn = (modules: ModuleLibrary): Patch =>
  patchOf(
    [
      { id: 'in', type: 'returnIn' },
      { id: 'delay', type: 'pingPong', name: 'Dotted eighth', params: { time: 0.75, feedback: 0.52, mix: 1, sync: 1 } },
      { id: 'tone', type: 'filter', name: 'Darken', stereo: true, params: { mode: 0, cutoff: 3400, resonance: 0.7 } },
      { id: 'hp', type: 'filter', name: 'Low cut', stereo: true, params: { mode: 1, cutoff: 320, resonance: 0.7 } },
      duckUse(0.45, 180),
      { id: 'out', type: 'trackOut' },
      knob('time', 'Time', { value: 0.75, min: 0.125, max: 2, step: 0.125, unit: 'beats' }),
      knob('feedback', 'Feedback', { value: 0.52, min: 0, max: 0.88 }),
      toggle('throw', 'Throw (hold)', { mode: 'momentary' }),
      { id: 'throwTo', type: 'mix', name: 'Feedback, or the throw', params: { b: 0.9 } },
      knob('dark', 'Darken', { value: 3400, min: 600, max: 12000, unit: 'Hz', curve: 'log' }),
    ],
    ['in.out>delay.in', 'time.out>delay.param:time', 'feedback.out>throwTo.a', 'throw.out>throwTo.t', 'throwTo.out>delay.param:feedback', 'delay.out>tone.in', 'dark.out>tone.param:cutoff', 'tone.out>hp.in', 'hp.out>duck.vca:in', 'duck.vca:out>out.in'],
    { prefix: 'fx_', modules },
  )

/** The hall: a long, dark reverb for the drone and the breakdown. */
export const hallReturn = (): Patch =>
  patchOf(
    [
      { id: 'in', type: 'returnIn' },
      { id: 'verb', type: 'stereoReverb', name: 'Hall', params: { size: 0.88, damping: 0.5, predelay: 0.03, mix: 1 } },
      { id: 'tone', type: 'filter', name: 'Darken', stereo: true, params: { mode: 0, cutoff: 5200, resonance: 0.7 } },
      { id: 'out', type: 'trackOut' },
      knob('size', 'Size', { value: 0.88, min: 0.3, max: 0.98 }),
      knob('damp', 'Damping', { value: 0.5, min: 0, max: 1 }),
      knob('dark', 'Darken', { value: 5200, min: 800, max: 14000, unit: 'Hz', curve: 'log' }),
    ],
    ['in.out>verb.in', 'size.out>verb.param:size', 'damp.out>verb.param:damping', 'verb.out>tone.in', 'dark.out>tone.param:cutoff', 'tone.out>out.in'],
    { prefix: 'fx_' },
  )

/**
 * The master: a Cut button (hold it to mute the mix, let go on the beat), and one slider turns a DJ filter (left of centre it closes a low-pass down, right of centre it opens a high-pass up; the
 * middle leaves the sound alone), a knob sets the stereo width, and the output level is
 * read out in decibels. The slider is the whole filter: its value drives two Map range nodes that set the two cutoffs.
 */
export const masterGraph = (): Patch =>
  patchOf(
    [
      { id: 'in', type: 'masterIn' },
      knob('dj', 'DJ filter', { value: 0, min: -1, max: 1, step: 0.01, display: 'slider-horizontal', size: 'L' }),
      { id: 'closing', type: 'min', name: 'Left half', params: { b: 0 } },
      { id: 'opening', type: 'max', name: 'Right half', params: { b: 0 } },
      { id: 'lpCut', type: 'mapRange', name: 'Low-pass cutoff', params: { inMin: -1, inMax: 0, outMin: 180, outMax: 20000, curve: 1 } },
      { id: 'hpCut', type: 'mapRange', name: 'High-pass cutoff', params: { inMin: 0, inMax: 1, outMin: 20, outMax: 3200, curve: 1 } },
      { id: 'lp', type: 'filter', name: 'DJ low-pass', stereo: true, params: { mode: 0, cutoff: 20000, resonance: 1.1 } },
      { id: 'hp', type: 'filter', name: 'DJ high-pass', stereo: true, params: { mode: 1, cutoff: 20, resonance: 1.1 } },
      { id: 'wide', type: 'width', name: 'Width', params: { width: 1.12 } },
      { id: 'cutGlide', type: 'smooth', name: 'Glide (a few ms)', params: { mode: 0, time: 0.012 } },
      { id: 'cutVca', type: 'gain', name: 'Cut', stereo: true },
      { id: 'out', type: 'trackOut' },
      knob('stereo', 'Width', { value: 1.12, min: 0, max: 2 }),
      toggle('cut', 'Cut (hold)', { mode: 'momentary', offValue: 1, onValue: 0 }),
      { id: 'mono', type: 'monoSum' },
      { id: 'level', type: 'level', name: 'Output level', params: { mode: 1, time: 300 } },
      readout('dB', 'Level', { decimals: 1, unit: 'dB' }),
      meter('bars', 'Meter', -36, 0),
    ],
    [
      'dj.out>closing.a',
      'dj.out>opening.a',
      'closing.out>lpCut.in',
      'opening.out>hpCut.in',
      'in.out>lp.in',
      'lpCut.out>lp.param:cutoff',
      'lp.out>hp.in',
      'hpCut.out>hp.param:cutoff',
      'hp.out>wide.in',
      'stereo.out>wide.param:width',
      'wide.out>cutVca.in',
      'cut.out>cutGlide.in',
      'cutGlide.out>cutVca.cv',
      'cutVca.out>out.in',
      'cutVca.out>mono.in',
      'mono.out>level.in',
      'level.out>dB.in',
      'level.out>bars.in',
    ],
    { prefix: 'master_' },
  )
