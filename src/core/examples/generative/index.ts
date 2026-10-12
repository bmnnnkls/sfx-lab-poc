import type { ModuleLibrary, Patch } from '../../patch'
import type { Clip, Project } from '../../project'
import { patchOf, toggle } from '../builder'
import { chordNotes, clipOf, heldClip, noteAt, pitchOf } from '../score'
import { type InstrumentSpec, projectOf } from '../tracks'
import { generativeModules } from './modules'
import { echoReturn, hallReturn, masterGraph, padFx, rainFx, wanderFx } from './mix'
import { arpPatch, bellsPatch, dropsPatch, heartPatch, padPatch, rainPatch, subPatch, ticksPatch, windPatch } from './voices'

/**
 * GLASS RAIN: a self-composing piece at 92 BPM in D. Nothing in it is a pattern someone typed: the bells are a Perlin wander sampled
 * by a clock and a die, the drops are a Geiger counter drawing notes from a scale, the ticks are a die rolled sixteen times a bar.
 * The clips only switch parts on and say how loud, and they are deliberately different lengths (the heartbeat is 1.5 bars, the ticks 3,
 * the bells 5 or 7, the drops 7, the wind 8 and the harmony 16), so the parts drift against each other and a scene takes many minutes
 * to come round to where it began.
 *
 * Six scenes, from fog to storm and back. Then press Randomize on a track and listen to a different piece.
 */

export const GLASS_RAIN_TEMPO = 92
const SCENES = 6
const [FOG, RAIN, GLASS, GARDEN, STORM, CLEARING] = [0, 1, 2, 3, 4, 5] as const

type ByScene = Record<number, Clip>

/** A clip of one held note: a self-playing voice only needs to be told to run, and how loudly. */
const held = (track: string, scene: number, name: string, beats: number, velocity: number): Clip => heldClip(`${track}-s${scene}`, name, beats, 60, velocity)

// ---- Harmony: four chords, sixteen beats each, over the roots D, G, D and A. Every note of every chord is in the scale the bells and the
// drops play (D E G A C), so nothing the generative parts do can clash with them.

const CHORDS: ReadonlyArray<readonly [number, number, string]> = [
  [0, 16, 'D3+A3+C4+E4+G4'],
  [16, 16, 'G3+D4+E4+A4+C5'],
  [32, 16, 'D3+A3+C4+E4+G4'],
  [48, 16, 'A2+E3+G3+C4+D4'],
]

const padClips = (): ByScene => {
  const make = (scene: number, name: string, velocity: number) => clipOf(`pad-s${scene}`, name, chordNotes(`pad-s${scene}`, CHORDS, 64, velocity), 64)
  return {
    [FOG]: make(FOG, 'Chords, soft', 0.72),
    [RAIN]: make(RAIN, 'Chords, soft', 0.7),
    [GLASS]: make(GLASS, 'Chords', 0.73),
    // From here the pad is played hard enough to wake the arp (its note graph listens for velocity above 0.75).
    [GARDEN]: make(GARDEN, 'Chords, full', 0.86),
    [STORM]: make(STORM, 'Chords, full', 0.88),
    [CLEARING]: make(CLEARING, 'Chords, soft', 0.68),
  }
}

const subClips = (): ByScene => {
  const roots = ['D2', 'G2', 'D2', 'A2']
  const make = (scene: number, velocity: number) =>
    clipOf(`sub-s${scene}`, 'Roots', { notes: roots.map((root, index) => noteAt(`sub-s${scene}`, index, pitchOf(root), index * 16, 15.5, velocity)), beats: 64 }, 64)
  return { [GLASS]: make(GLASS, 0.7), [GARDEN]: make(GARDEN, 0.85), [STORM]: make(STORM, 0.9), [CLEARING]: make(CLEARING, 0.55) }
}

/** The heartbeat: a hit every dotted quarter (1.5 beats), alternately strong and soft, so a cycle is six beats against the four of the bar. */
const heartClips = (): ByScene => {
  const make = (scene: number, strong: number, soft: number, name: string) =>
    clipOf(`heart-s${scene}`, name, { notes: [[0, strong], [1.5, soft], [3, strong * 0.95], [4.5, soft * 0.9]].map(([start, velocity], index) => noteAt(`heart-s${scene}`, index, 38, start as number, 0.3, velocity as number)), beats: 6 }, 6)
  return { [GLASS]: make(GLASS, 0.6, 0.35, 'Heart, quiet'), [GARDEN]: make(GARDEN, 0.85, 0.5, 'Heart'), [STORM]: make(STORM, 1, 0.65, 'Heart, hard') }
}

const bellsClips = (): ByScene => ({
  [RAIN]: held('bells', RAIN, 'Bells, distant (5 bars)', 20, 0.45),
  [GLASS]: held('bells', GLASS, 'Bells (5 bars)', 20, 0.8),
  [GARDEN]: held('bells', GARDEN, 'Bells (7 bars)', 28, 0.85),
  [STORM]: held('bells', STORM, 'Bells, bright (5 bars)', 20, 1),
  [CLEARING]: held('bells', CLEARING, 'Bells, last ones (7 bars)', 28, 0.5),
})

const dropsClips = (): ByScene => ({
  [FOG]: held('drops', FOG, 'A few drops (7 bars)', 28, 0.6),
  [RAIN]: held('drops', RAIN, 'Drops (7 bars)', 28, 0.8),
  [GLASS]: held('drops', GLASS, 'Drops (7 bars)', 28, 0.7),
  [GARDEN]: held('drops', GARDEN, 'Drops, far (7 bars)', 28, 0.5),
  [STORM]: held('drops', STORM, 'Downpour (7 bars)', 28, 0.85),
  [CLEARING]: held('drops', CLEARING, 'Last drops (7 bars)', 28, 0.45),
})

const rainClips = (): ByScene => ({
  [RAIN]: held('rain', RAIN, 'Rain (4 bars)', 16, 0.65),
  [GLASS]: held('rain', GLASS, 'Rain (4 bars)', 16, 0.5),
  [GARDEN]: held('rain', GARDEN, 'Rain, far (4 bars)', 16, 0.35),
  [STORM]: held('rain', STORM, 'Downpour (4 bars)', 16, 0.85),
})

const windClips = (): ByScene => ({
  [FOG]: held('wind', FOG, 'Wind (8 bars)', 32, 1),
  [RAIN]: held('wind', RAIN, 'Wind (8 bars)', 32, 0.65),
  [STORM]: held('wind', STORM, 'Gale (8 bars)', 32, 0.75),
  [CLEARING]: held('wind', CLEARING, 'Wind (8 bars)', 32, 0.45),
})

const ticksClips = (): ByScene => ({
  [GARDEN]: held('ticks', GARDEN, 'Ticks (3 bars)', 12, 0.7),
  [STORM]: held('ticks', STORM, 'Ticks, loud (3 bars)', 12, 1),
})

// ---- The arp: no clips of its own

/**
 * Pad notes -> keep only the hard ones -> up an octave -> arpeggiate -> softer -> out. Track notes takes the pad's own notes, so the arp
 * plays whatever chord the pad plays; Range split lets through only notes played at velocity 0.75 and above, so the arp is silent in
 * the soft scenes and wakes in the loud ones; and the Arp switch on the Notes panel turns it off.
 */
const arpNotes = (): Patch =>
  patchOf(
    [
      { id: 'pad', type: 'trackNotes', name: 'The pad\'s notes', trackId: 'pad', params: { tap: 0 } },
      { id: 'hard', type: 'rangeSplit', name: 'Only the hard ones', params: { lowPitch: 0, highPitch: 127, minVelocity: 0.75, maxVelocity: 1 } },
      { id: 'up', type: 'transpose', name: 'An octave up', params: { semitones: 12 } },
      { id: 'run', type: 'arpeggiator', name: 'Eighths, up', params: { rate: 1, pattern: 0, octaves: 2, gate: 0.5 } },
      { id: 'soft', type: 'velocity', name: 'Arp level', params: { scale: 0.8 } },
      { id: 'out', type: 'noteOut' },
      toggle('on', 'Arp', { on: true, offValue: 0, onValue: 0.8 }),
    ],
    ['pad.out>hard.in', 'hard.inside>up.in', 'up.out>run.in', 'run.out>soft.in', 'on.out>soft.param:scale', 'soft.out>out.in'],
    { prefix: 'ng_' },
  )

// ---- The project

export const createGlassRain = (): Project => {
  const modules: ModuleLibrary = generativeModules()
  const tracks: InstrumentSpec[] = [
    { id: 'pad', name: 'Pad', patch: padPatch(), voices: 8, volume: 0.66, fx: padFx(), sends: { hall: 0.45 }, clips: padClips() },
    { id: 'sub', name: 'Sub', patch: subPatch(), voices: 2, volume: 0.7, clips: subClips() },
    { id: 'heart', name: 'Heart', patch: heartPatch(), voices: 2, volume: 0.7, sends: { hall: 0.12 }, clips: heartClips() },
    { id: 'bells', name: 'Bells', patch: bellsPatch(modules), voices: 3, volume: 0.62, fx: wanderFx(51, 0.09, 0.55), sends: { echo: 0.55, hall: 0.5 }, clips: bellsClips() },
    { id: 'drops', name: 'Drops', patch: dropsPatch(modules), voices: 3, volume: 0.58, fx: wanderFx(52, 0.2, 0.75), sends: { echo: 0.4, hall: 0.55 }, clips: dropsClips() },
    { id: 'rain', name: 'Rain', patch: rainPatch(), voices: 2, volume: 0.6, fx: rainFx(), sends: { hall: 0.2 }, clips: rainClips() },
    { id: 'wind', name: 'Wind', patch: windPatch(), voices: 2, volume: 0.58, fx: wanderFx(53, 0.05, 0.6), sends: { hall: 0.3 }, clips: windClips() },
    { id: 'ticks', name: 'Ticks', patch: ticksPatch(modules), voices: 3, volume: 0.5, fx: wanderFx(54, 0.35, 0.6), sends: { echo: 0.35 }, clips: ticksClips() },
    { id: 'arp', name: 'Arp', patch: arpPatch(modules), notes: arpNotes(), voices: 6, volume: 0.5, fx: wanderFx(55, 0.12, 0.4), sends: { echo: 0.5, hall: 0.4 }, clips: {} },
  ]
  return projectOf({
    name: 'Glass Rain',
    tempo: GLASS_RAIN_TEMPO,
    sceneCount: SCENES,
    sceneNames: ['Fog', 'Rain', 'Glass', 'Garden', 'Storm', 'Clearing'],
    modules,
    master: { fx: masterGraph(), volume: 0.5 },
    tracks,
    returns: [
      { id: 'hall', name: 'Hall', fx: hallReturn(), volume: 0.7 },
      { id: 'echo', name: 'Echo', fx: echoReturn(), volume: 0.62 },
    ],
  })
}
