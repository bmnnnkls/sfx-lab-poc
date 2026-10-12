import type { ModuleLibrary, Patch } from '../../patch'
import type { Clip, Project } from '../../project'
import { patchOf } from '../builder'
import { chordNotes, clipOf, drumNotes, heldClip, lineNotes, noteAt, pitchOf } from '../score'
import { type InstrumentSpec, projectOf } from '../tracks'
import { clapPatch, hatPatch, kickPatch, noiseVoicePatch, openHatPatch, shakerPatch } from './drums'
import { duckFx, duckHighpassFx, droneFx, echoReturn, hallReturn, masterGraph, roomReturn } from './mix'
import { KICK_TRACK, techHouseModules } from './modules'
import { bassPatch, dronePatch, dustPatch, pluckPatch, riserPatch, stabPatch, tokPatch } from './synths'

/**
 * LOW LIGHT: minimal tech house at 125 BPM in A minor. Eight scenes that play as a track: launch them in order (or play with
 * the clips). The piece is about restraint: a kick that never changes, a bass that sits between the kicks, one organ chord with a long
 * echo, and a lot of small percussion that interlocks. Everything is made from nodes (no samples), the bass, stab, arp, drone
 * and echo all duck under the real sound of the kick, and every graph has a panel to play with.
 */

export const LOW_LIGHT_TEMPO = 125
const SCENES = 8
const BAR = 4

/** Scene numbers, from 0. */
const [INTRO, GROOVE, STAB, HOOK, BREAK, BUILD, DROP, OUTRO] = [0, 1, 2, 3, 4, 5, 6, 7] as const

/** Four bars of 16 steps written one bar at a time, so a pattern can change at the fourth bar. */
const bars = (...patterns: string[]): string => patterns.join(' ')

type ByScene = Record<number, Clip>

// ---- Drums

const kickClips = (): ByScene => {
  const straight = bars('X... X... X... X...', 'X... X... X... X...', 'X... X... X... X...', 'X... X... X... X...')
  // The bar before the drop: three bars of kick, then nothing but the riser.
  const pull = bars('X... X... X... X...', 'X... X... X... X...', 'X... X... X... X...', '.... .... .... ....')
  const make = (scene: number, pattern: string, name: string) => clipOf(`kick-s${scene}`, name, drumNotes(`kick-s${scene}`, pattern, { dynamics: 0.02, seed: scene + 1 }))
  return {
    [INTRO]: make(INTRO, straight, 'Four on the floor'),
    [GROOVE]: make(GROOVE, straight, 'Four on the floor'),
    [STAB]: make(STAB, straight, 'Four on the floor'),
    [HOOK]: make(HOOK, straight, 'Four on the floor'),
    [BUILD]: make(BUILD, pull, 'Pull-out'),
    [DROP]: make(DROP, straight, 'Four on the floor'),
    [OUTRO]: make(OUTRO, straight, 'Four on the floor'),
  }
}

/** A clap is three quick hands: `beats` are where each clap lands, in beats from the clip's start. */
const flamClap = (clipId: string, hits: ReadonlyArray<readonly [number, number]>, length: number): Clip => {
  const notes = hits.flatMap(([beat, velocity], hit) =>
    [0, 0.034, 0.07].map((offset, index) => noteAt(clipId, hit * 3 + index, 60, beat + offset, 0.1, Math.min(1, velocity * [0.6, 0.78, 1][index]!))),
  )
  return { id: clipId, name: 'Backbeat', lengthBeats: length, notes }
}

const clapClips = (): ByScene => {
  const backbeat = (scene: number, extra: ReadonlyArray<readonly [number, number]> = []) =>
    flamClap(`clap-s${scene}`, [...[0, 1, 2, 3].flatMap((bar) => [[bar * BAR + 1, 0.95] as const, [bar * BAR + 3, 1] as const]), ...extra], 16)
  // The roll that leads into the drop: eighths, then sixteenths getting louder.
  const roll: Array<readonly [number, number]> = [
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => [8 + i * 0.5, 0.35 + i * 0.04] as const),
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((i) => [12 + i * 0.25, 0.4 + i * 0.04] as const),
  ]
  const build = flamClap('clap-s5', [[1, 0.9], [3, 0.95], [5, 0.9], [7, 0.95]], 16)
  return {
    [GROOVE]: backbeat(GROOVE),
    [STAB]: backbeat(STAB),
    [HOOK]: backbeat(HOOK, [[15.75, 0.5]]),
    [BUILD]: { ...build, name: 'Roll', notes: [...build.notes, ...roll.map(([beat, velocity], index) => noteAt('clap-s5', 100 + index, 60, beat, 0.1, Math.min(1, velocity)))] },
    [DROP]: backbeat(DROP, [[7.75, 0.5], [15.75, 0.55]]),
  }
}

const HAT_BAR = 'x g . g x g . g x g . g x g . g'
const HAT_FILL = 'x g . g x g . g x g . g x g x g'
const HAT_BUSY = 'x g x g x g x g x g x g x g x g'

const hatClips = (): ByScene => {
  const make = (scene: number, pattern: string, name: string) =>
    clipOf(`hat-s${scene}`, name, drumNotes(`hat-s${scene}`, pattern, { swing: 57, drift: 0.004, dynamics: 0.07, seed: 10 + scene }))
  const normal = bars(HAT_BAR, HAT_BAR, HAT_BAR, HAT_FILL)
  return {
    [INTRO]: make(INTRO, bars(HAT_BAR, HAT_BAR, HAT_BAR, HAT_BAR), 'Hats'),
    [GROOVE]: make(GROOVE, normal, 'Hats'),
    [STAB]: make(STAB, normal, 'Hats'),
    [HOOK]: make(HOOK, normal, 'Hats'),
    [BREAK]: make(BREAK, bars('x . . . . . . . x . . . . . . .', 'x . . . . . . . x . . . . . . .', 'x . . . . . . . x . . . . . . .', 'x . . . x . . . x . . . x . x .'), 'Hats, sparse'),
    [BUILD]: make(BUILD, bars(HAT_BAR, HAT_BAR, HAT_BUSY, HAT_BUSY), 'Hats, building'),
    [DROP]: make(DROP, bars(HAT_BUSY, HAT_BUSY, HAT_BUSY, HAT_FILL), 'Hats, busy'),
    [OUTRO]: make(OUTRO, bars(HAT_BAR, HAT_BAR, HAT_BAR, HAT_BAR), 'Hats'),
  }
}

const OPEN_BAR = '. . X . . . x . . . X . . . x .'

const openHatClips = (): ByScene => {
  const make = (scene: number, pattern: string, name: string) =>
    clipOf(`open-s${scene}`, name, drumNotes(`open-s${scene}`, pattern, { drift: 0.004, dynamics: 0.05, seed: 30 + scene }))
  const plain = bars(OPEN_BAR, OPEN_BAR, OPEN_BAR, OPEN_BAR)
  return {
    [GROOVE]: make(GROOVE, plain, 'Off-beat open hat'),
    [STAB]: make(STAB, plain, 'Off-beat open hat'),
    [HOOK]: make(HOOK, plain, 'Off-beat open hat'),
    [DROP]: make(DROP, bars(OPEN_BAR, OPEN_BAR, OPEN_BAR, '. . X . . . x . . . X . . X . X'), 'Off-beat open hat'),
  }
}

const SHAKER_BAR = 'o g x g o g x g o g x g o g x g'

const shakerClips = (): ByScene => {
  const make = (scene: number, pattern: string, name: string) =>
    clipOf(`shaker-s${scene}`, name, drumNotes(`shaker-s${scene}`, pattern, { swing: 60, drift: 0.006, dynamics: 0.1, seed: 50 + scene }))
  const plain = bars(SHAKER_BAR, SHAKER_BAR, SHAKER_BAR, SHAKER_BAR)
  const soft = bars('g . g . o . g . g . g . o . g .', 'g . g . o . g . g . g . o . g .', 'g . g . o . g . g . g . o . g .', 'g . g . o . g . g . g . o g o g')
  return {
    [INTRO]: make(INTRO, plain, 'Shaker'),
    [GROOVE]: make(GROOVE, plain, 'Shaker'),
    [STAB]: make(STAB, plain, 'Shaker'),
    [HOOK]: make(HOOK, plain, 'Shaker'),
    [BREAK]: make(BREAK, soft, 'Shaker, soft'),
    [BUILD]: make(BUILD, plain, 'Shaker'),
    [DROP]: make(DROP, plain, 'Shaker'),
    [OUTRO]: make(OUTRO, plain, 'Shaker'),
  }
}

/** Tonal percussion: two bars of knocks that never land on the kick, in A minor pentatonic. */
const tokClips = (): ByScene => {
  const pattern = bars('. . . x . . x . . . . x . . x .', '. . . x . . x . . . . x . . . x')
  const pitches = ['D5', 'A4', 'D5', 'E5', 'D5', 'G4', 'A4', 'E5', 'D5'].map(pitchOf)
  const make = (scene: number, name: string, thin = false) => {
    const notes = drumNotes(`tok-s${scene}`, thin ? bars('. . . x . . . . . . . x . . . .', '. . . x . . . . . . . . . . x .') : pattern, { pitch: pitches, swing: 54, drift: 0.005, dynamics: 0.08, seed: 70 + scene, length: 0.12 })
    return clipOf(`tok-s${scene}`, name, notes, 8)
  }
  return {
    [INTRO]: make(INTRO, 'Knocks, sparse', true),
    [GROOVE]: make(GROOVE, 'Knocks'),
    [STAB]: make(STAB, 'Knocks'),
    [HOOK]: make(HOOK, 'Knocks'),
    [BREAK]: make(BREAK, 'Knocks, sparse', true),
    [DROP]: make(DROP, 'Knocks'),
    [OUTRO]: make(OUTRO, 'Knocks, sparse', true),
  }
}

/** One crash on the first beat of a scene: a long noise hit into the hall. */
const crashClips = (): ByScene => {
  const make = (scene: number) => clipOf(`crash-s${scene}`, 'Crash', { notes: [noteAt(`crash-s${scene}`, 0, 60, 0, 0.5, 0.95)], beats: 16 }, 16)
  return { [GROOVE]: make(GROOVE), [HOOK]: make(HOOK), [DROP]: make(DROP) }
}

// ---- Bass, stab, arp

/** The progression: Am7, Am7, Dm7, Em7 (i, i, iv, v of A minor), one chord a bar. */
const bassClips = (): ByScene => {
  const groove = bars(
    '. . A1 . . . A1 . . . A1 . . . A1 .',
    '. . A1 . . . A1 . . . A1 . . A1 . .',
    '. . D2 . . . D2 . . . D2 . . . A2 .',
    '. . E2 . . . E2 . . . E2 . . . D2 E2',
  )
  const drop = bars(
    '. . A1 A1 . . A1 . . . A1 A1 . . A1 A2',
    '. . A1 . . . A1 A1 . . A1 . . A1 . A1',
    '. . D2 D2 . . D2 . . . D2 D2 . . A2 .',
    '. . E2 E2 . . E2 . . . E2 . . E2 D2 E2',
  )
  const outro = bars('. . A1 . . . A1 . . . A1 . . . A1 .', '. . A1 . . . A1 . . . A1 . . . A1 .', '. . A1 . . . A1 . . . A1 . . . A1 .', '. . A1 . . . A1 . . . A1 . . . . .')
  const make = (scene: number, text: string, name: string) => clipOf(`bass-s${scene}`, name, lineNotes(`bass-s${scene}`, text, { swing: 55, drift: 0.004, dynamics: 0.06, seed: 90 + scene, gate: 0.78 }))
  return {
    [GROOVE]: make(GROOVE, groove, 'Off-beat roll'),
    [STAB]: make(STAB, groove, 'Off-beat roll'),
    [HOOK]: make(HOOK, groove, 'Off-beat roll'),
    [DROP]: make(DROP, drop, 'Roll, busier'),
    [OUTRO]: make(OUTRO, outro, 'Root only'),
  }
}

const stabClips = (): ByScene => {
  const roots = ['A3', 'A3', 'D3', 'E3']
  /** `rhythm` lists the steps of each bar the chord is hit on. */
  const make = (scene: number, name: string, rhythm: readonly (readonly number[])[]) => {
    const tokens = roots.flatMap((root, bar) => Array.from({ length: 16 }, (_, step) => (rhythm[bar]?.includes(step) ? `${root}@${[0.9, 0.7, 0.8, 0.6][step % 4]}` : '.')))
    return clipOf(`stab-s${scene}`, name, lineNotes(`stab-s${scene}`, tokens.join(' '), { swing: 56, drift: 0.005, dynamics: 0.06, seed: 110 + scene, gate: 0.85 }))
  }
  const main = [[3, 11], [3, 11], [3, 7, 11], [3, 11, 14]]
  return {
    [STAB]: make(STAB, 'Offbeat stab', main),
    [HOOK]: make(HOOK, 'Offbeat stab', main),
    [BREAK]: make(BREAK, 'Stab, alone', [[3], [3], [3], [3]]),
    [BUILD]: make(BUILD, 'Stab', [[3, 11], [3, 11], [3, 7, 11], [3, 7, 11, 14]]),
    [DROP]: make(DROP, 'Offbeat stab', [[3, 7, 11], [3, 11], [3, 7, 11], [3, 7, 11, 14]]),
  }
}

/** The arp is fed one held note a bar; the note graph turns it into a chord and runs it up and down. */
const arpClips = (): ByScene => {
  const bar = (root: string, held = true) => [held ? `${root}:16` : `${root}:8`, ...Array.from({ length: 15 }, () => '.')]
  const make = (scene: number, name: string, held: boolean[]) => {
    const roots = ['A3', 'A3', 'D3', 'E3']
    return clipOf(`arp-s${scene}`, name, lineNotes(`arp-s${scene}`, roots.flatMap((root, index) => bar(root, held[index] ?? true)).join(' '), { gate: 1, seed: 130 + scene }))
  }
  return {
    [HOOK]: make(HOOK, 'Arp, half time', [false, true, false, true]),
    [BUILD]: make(BUILD, 'Arp', [true, true, true, true]),
    [DROP]: make(DROP, 'Arp', [true, true, true, true]),
  }
}

const droneClips = (): ByScene => {
  const am = chordNotes('drone-s4', [[0, 8, 'A2+E3+C4'], [8, 4, 'D2+A2+F3'], [12, 4, 'E2+B2+G3']], 16)
  const long = (scene: number) => clipOf(`drone-s${scene}`, 'Drone', chordNotes(`drone-s${scene}`, [[0, 16, 'A2+E3']], 16))
  return {
    [INTRO]: long(INTRO),
    [BREAK]: clipOf('drone-s4', 'Drone, breakdown', am),
    [BUILD]: clipOf('drone-s5', 'Drone', chordNotes('drone-s5', [[0, 8, 'A2+E3+C4'], [8, 8, 'D2+A2+F3']], 16)),
    [OUTRO]: long(OUTRO),
  }
}

const riserClips = (): ByScene => ({
  // Nothing for two bars, then the sweep for two: the note starts on beat 8.
  [BUILD]: { ...heldClip('riser-s5', 'Riser', 16, 'A3'), notes: [noteAt('riser-s5', 0, pitchOf('A3'), 8, 7.9, 0.9)] },
})

const dustClips = (): ByScene =>
  Object.fromEntries(Array.from({ length: SCENES }, (_, scene) => [scene, heldClip(`dust-s${scene}`, 'Dust', 16, 60, 0.9)]))

// ---- Note graphs

/** Clip notes -> Chord -> Scale lock -> To instrument: one note a bar becomes a chord, and nothing can sound out of key. */
const stabNotes = (): Patch =>
  patchOf(
    [
      { id: 'clip', type: 'clipNotes' },
      { id: 'chord', type: 'chord', name: 'Minor seventh', params: { chord: 6 } },
      { id: 'key', type: 'scaleLock', name: 'A minor', params: { root: 9, scale: 1 } },
      { id: 'out', type: 'noteOut' },
    ],
    ['clip.out>chord.in', 'chord.out>key.in', 'key.out>out.in'],
    { prefix: 'ng_' },
  )

/** The same chord, but the arpeggiator runs it as sixteenths up and down two octaves (a cycle of 14 steps against a bar of 16, so the pattern drifts). */
const arpNotes = (): Patch =>
  patchOf(
    [
      { id: 'clip', type: 'clipNotes' },
      { id: 'chord', type: 'chord', name: 'Minor seventh', params: { chord: 6 } },
      { id: 'key', type: 'scaleLock', name: 'A minor', params: { root: 9, scale: 1 } },
      { id: 'arp', type: 'arpeggiator', name: 'Sixteenths', params: { rate: 2, pattern: 2, octaves: 2, gate: 0.5 } },
      { id: 'soft', type: 'velocity', name: 'Softer', params: { scale: 0.8 } },
      { id: 'out', type: 'noteOut' },
    ],
    ['clip.out>chord.in', 'chord.out>key.in', 'key.out>arp.in', 'arp.out>soft.in', 'soft.out>out.in'],
    { prefix: 'ng_' },
  )

// ---- The project

/** The crash is the open hat's noise voice, left to ring for a second. */
const crashPatch = (modules: ModuleLibrary): Patch =>
  noiseVoicePatch(modules, 'Crash', { filter: 1, seed: 25, tone: 4200, body: 0.8, decay: 0.9, metal: 0.5, level: 0.7, range: { tone: [2500, 10000], body: [0.5, 1.6], decay: [0.4, 0.9], metal: [0, 1] } })

export const createLowLight = (): Project => {
  const modules: ModuleLibrary = techHouseModules()
  const tracks: InstrumentSpec[] = [
    { id: KICK_TRACK, name: 'Kick', patch: kickPatch(modules), voices: 2, volume: 0.85, clips: kickClips() },
    { id: 'clap', name: 'Clap', patch: clapPatch(modules), voices: 6, volume: 0.77, pan: 0.04, sends: { room: 0.3 }, clips: clapClips() },
    { id: 'hat', name: 'Hat', patch: hatPatch(modules), voices: 3, volume: 0.54, pan: 0.18, sends: { room: 0.06 }, clips: hatClips() },
    { id: 'open', name: 'Open hat', patch: openHatPatch(modules), voices: 3, volume: 0.4, pan: -0.14, sends: { room: 0.14 }, clips: openHatClips() },
    { id: 'shaker', name: 'Shaker', patch: shakerPatch(modules), voices: 3, volume: 0.6, pan: -0.3, sends: { echo: 0.1 }, clips: shakerClips() },
    { id: 'tok', name: 'Knocks', patch: tokPatch(), voices: 4, volume: 0.38, pan: 0.22, sends: { echo: 0.42, room: 0.12 }, clips: tokClips() },
    { id: 'bass', name: 'Bass', patch: bassPatch(modules), voices: 2, volume: 0.84, fx: duckFx(modules, 0.78, 130), clips: bassClips() },
    { id: 'stab', name: 'Stab', patch: stabPatch(modules), notes: stabNotes(), voices: 8, volume: 0.44, pan: -0.06, fx: duckHighpassFx(modules, 0.45, 160), sends: { echo: 0.38, room: 0.22 }, clips: stabClips() },
    { id: 'arp', name: 'Arp', patch: pluckPatch(), notes: arpNotes(), voices: 5, volume: 0.32, pan: 0.1, fx: duckHighpassFx(modules, 0.5, 200), sends: { echo: 0.3, room: 0.22 }, clips: arpClips() },
    { id: 'drone', name: 'Drone', patch: dronePatch(), voices: 8, volume: 0.5, fx: droneFx(modules), sends: { hall: 0.55 }, clips: droneClips() },
    { id: 'riser', name: 'Riser', patch: riserPatch(), voices: 2, volume: 0.5, sends: { hall: 0.25 }, clips: riserClips() },
    { id: 'crash', name: 'Crash', patch: crashPatch(modules), voices: 2, volume: 0.2, sends: { hall: 0.5, room: 0.2 }, clips: crashClips() },
    { id: 'dust', name: 'Dust', patch: dustPatch(), voices: 2, volume: 0.34, pan: 0, clips: dustClips() },
  ]
  return projectOf({
    name: 'Low Light',
    tempo: LOW_LIGHT_TEMPO,
    sceneCount: SCENES,
    sceneNames: ['Intro', 'Groove', 'Stab', 'Hook', 'Break', 'Build', 'Drop', 'Outro'],
    modules,
    master: { fx: masterGraph(), volume: 0.58 },
    tracks,
    returns: [
      { id: 'room', name: 'Room', fx: roomReturn(), volume: 0.7 },
      { id: 'echo', name: 'Echo', fx: echoReturn(modules), volume: 0.62 },
      { id: 'hall', name: 'Hall', fx: hallReturn(), volume: 0.6 },
    ],
  })
}
