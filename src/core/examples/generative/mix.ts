import type { Patch } from '../../patch'
import { knob, meter, patchOf, readout, toggle } from '../builder'

/**
 * The effects graphs of "Glass Rain": every instrument is mono, so its insert graph is where it gets a place in the stereo field
 * (a Perlin wander into a Pan node, so a sound drifts about instead of sitting still), and the two returns and the master do the rest.
 */

/** Track in -> Pan, moved around by a slow wander -> Track out. `reach` is how far from the middle it may roam; `rate` how fast. */
export const wanderFx = (seed: number, rate: number, reach: number): Patch =>
  patchOf(
    [
      { id: 'in', type: 'trackIn' },
      { id: 'wander', type: 'perlin', name: 'Wander', params: { rate, octaves: 2, persistence: 0.5, depth: 1, seed } },
      { id: 'scale', type: 'multiply', name: 'How far' },
      { id: 'pan', type: 'pan', name: 'Pan' },
      { id: 'out', type: 'trackOut' },
      knob('reach', 'Roam', { value: reach, min: 0, max: 1 }),
      knob('speed', 'Wander speed', { value: rate, min: 0.02, max: 2, unit: 'Hz', curve: 'log' }),
    ],
    ['in.out>pan.in', 'wander.out>scale.a', 'reach.out>scale.b', 'scale.out>pan.param:pan', 'speed.out>wander.param:rate', 'pan.out>out.in'],
    { prefix: 'fx_' },
  )

/**
 * The pad's effects: a gentle breath (an LFO locked to the tempo dips the volume once every two beats, a quarter of the way) and
 * then the same wandering pan.
 */
export const padFx = (): Patch =>
  patchOf(
    [
      { id: 'in', type: 'trackIn' },
      { id: 'breath', type: 'lfo', name: 'Breath', params: { shape: 0, rate: 0.5, sync: 1, depth: 1 } },
      { id: 'dip', type: 'multiply', name: 'Dip' },
      { id: 'rest', type: 'subtract', name: '1 minus the dip', params: { a: 1 } },
      { id: 'vca', type: 'gain', name: 'Breathe' },
      { id: 'wander', type: 'perlin', name: 'Wander', params: { rate: 0.07, octaves: 2, persistence: 0.5, depth: 1, seed: 41 } },
      { id: 'far', type: 'multiply', name: 'How far', params: { b: 0.5 } },
      { id: 'pan', type: 'pan', name: 'Pan' },
      { id: 'out', type: 'trackOut' },
      knob('breathDepth', 'Breath', { value: 0.22, min: 0, max: 0.8 }),
    ],
    ['in.out>vca.in', 'breath.uni>dip.a', 'breathDepth.out>dip.b', 'dip.out>rest.b', 'rest.out>vca.cv', 'vca.out>pan.in', 'wander.out>far.a', 'far.out>pan.param:pan', 'pan.out>out.in'],
    { prefix: 'fx_' },
  )

/**
 * Rain, widened: the mono rain goes to the left channel as it is and to the right a few milliseconds late (the Haas effect), so
 * it surrounds you instead of sitting in the middle.
 */
export const rainFx = (): Patch =>
  patchOf(
    [
      { id: 'in', type: 'trackIn' },
      { id: 'left', type: 'pan', name: 'To the left', params: { pan: -1 } },
      { id: 'late', type: 'controlDelay', name: 'A moment later', params: { time: 0.011 } },
      { id: 'right', type: 'pan', name: 'To the right', params: { pan: 1 } },
      { id: 'out', type: 'trackOut' },
      knob('gap', 'Spread', { value: 0.011, min: 0.001, max: 0.04, unit: 's', curve: 'log' }),
    ],
    ['in.out>left.in', 'left.out>out.in', 'in.out>late.in', 'gap.out>late.param:time', 'late.out>right.in', 'right.out>out.in'],
    { prefix: 'fx_' },
  )

/** The hall: a long reverb, darkened, for everything that should sit far away. */
export const hallReturn = (): Patch =>
  patchOf(
    [
      { id: 'in', type: 'returnIn' },
      { id: 'low', type: 'filter', name: 'Low cut', stereo: true, params: { mode: 1, cutoff: 180, resonance: 0.7 } },
      { id: 'verb', type: 'stereoReverb', name: 'Hall', params: { size: 0.93, damping: 0.5, predelay: 0.04, mix: 1 } },
      { id: 'tone', type: 'filter', name: 'Darken', stereo: true, params: { mode: 0, cutoff: 6500, resonance: 0.7 } },
      { id: 'out', type: 'trackOut' },
      knob('size', 'Size', { value: 0.93, min: 0.4, max: 0.98 }),
      knob('damp', 'Damping', { value: 0.5, min: 0, max: 1 }),
      knob('dark', 'Darken', { value: 6500, min: 1000, max: 16000, unit: 'Hz', curve: 'log' }),
    ],
    ['in.out>low.in', 'low.out>verb.in', 'size.out>verb.param:size', 'damp.out>verb.param:damping', 'verb.out>tone.in', 'dark.out>tone.param:cutoff', 'tone.out>out.in'],
    { prefix: 'fx_' },
  )

/** The echo: a ping-pong delay at a dotted eighth (Time in beats, synced to the tempo), each repeat a little darker (a low-pass after it). */
export const echoReturn = (): Patch =>
  patchOf(
    [
      { id: 'in', type: 'returnIn' },
      { id: 'delay', type: 'pingPong', name: 'Dotted eighth', params: { time: 0.75, feedback: 0.55, mix: 1, sync: 1 } },
      { id: 'tone', type: 'filter', name: 'Darken', stereo: true, params: { mode: 0, cutoff: 3600, resonance: 0.7 } },
      { id: 'low', type: 'filter', name: 'Low cut', stereo: true, params: { mode: 1, cutoff: 260, resonance: 0.7 } },
      { id: 'out', type: 'trackOut' },
      knob('time', 'Time', { value: 0.75, min: 0.125, max: 2, step: 0.125, unit: 'beats' }),
      knob('feedback', 'Feedback', { value: 0.55, min: 0, max: 0.92 }),
      knob('dark', 'Darken', { value: 3600, min: 600, max: 12000, unit: 'Hz', curve: 'log' }),
    ],
    ['in.out>delay.in', 'time.out>delay.param:time', 'feedback.out>delay.param:feedback', 'delay.out>tone.in', 'dark.out>tone.param:cutoff', 'tone.out>low.in', 'low.out>out.in'],
    { prefix: 'fx_' },
  )

/**
 * The master: a low-pass that takes the top off (Haze), the width, a Hush switch that lowers the whole piece to a murmur and brings
 * it back, smoothly, and the output level in decibels. The Hush is a switch into a Smooth node into a Gain's CV: three nodes you can
 * see on the Graph side.
 */
export const masterGraph = (): Patch =>
  patchOf(
    [
      { id: 'in', type: 'masterIn' },
      { id: 'haze', type: 'filter', name: 'Haze', stereo: true, params: { mode: 0, cutoff: 16000, resonance: 0.7 } },
      { id: 'wide', type: 'width', name: 'Width', params: { width: 1.15 } },
      { id: 'smooth', type: 'smooth', name: 'Glide', params: { mode: 0, time: 0.9 } },
      { id: 'hush', type: 'gain', name: 'Hush', stereo: true },
      { id: 'out', type: 'trackOut' },
      knob('hazeCut', 'Haze', { value: 16000, min: 600, max: 20000, unit: 'Hz', curve: 'log', size: 'M' }),
      knob('stereo', 'Width', { value: 1.15, min: 0, max: 2 }),
      toggle('quiet', 'Hush', { offValue: 1, onValue: 0.1 }),
      { id: 'mono', type: 'monoSum' },
      { id: 'level', type: 'level', name: 'Output level', params: { mode: 1, time: 300 } },
      readout('dB', 'Level', { decimals: 1, unit: 'dB' }),
      meter('bars', 'Meter', -36, 0),
    ],
    [
      'in.out>haze.in',
      'hazeCut.out>haze.param:cutoff',
      'haze.out>wide.in',
      'stereo.out>wide.param:width',
      'quiet.out>smooth.in',
      'wide.out>hush.in',
      'smooth.out>hush.cv',
      'hush.out>out.in',
      'hush.out>mono.in',
      'mono.out>level.in',
      'level.out>dB.in',
      'level.out>bars.in',
    ],
    { prefix: 'master_' },
  )
