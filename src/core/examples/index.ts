import type { Project } from '../project'
import { GLASS_RAIN_TEMPO, createGlassRain } from './generative'
import { LOW_LIGHT_TEMPO, createLowLight } from './tech-house'

/**
 * Projects that ship with the app, built from code (no samples, no files), so they are the same every time and need nothing but
 * the engine. They are here to be played with: each one says how to start.
 */
export interface ExampleProject {
  readonly id: string
  readonly title: string
  /** Style and tempo in a line, for the menu. */
  readonly tagline: string
  /** What to do first, one short sentence per line: shown when the example is loaded. */
  readonly howTo: readonly string[]
  readonly create: () => Project
}

export const exampleProjects: readonly ExampleProject[] = [
  {
    id: 'low-light',
    title: 'Low Light',
    tagline: `Minimal tech house, ${LOW_LIGHT_TEMPO} BPM`,
    howTo: [
      'Press ▶ on scene 1, then walk down the scenes: Intro, Groove, Stab, Hook, Break, Build, Drop, Outro.',
      'Open the Master strip, Effects tab, Panel: the DJ filter slider is the whole performance.',
      'Every track has a Panel (Instrument and Effects tabs): select one and turn things while it plays.',
      'The kick drives a real sidechain: the bass, stab, arp, drone and echo duck under its sound.',
    ],
    create: createLowLight,
  },
  {
    id: 'glass-rain',
    title: 'Glass Rain',
    tagline: `Self-composing ambient, ${GLASS_RAIN_TEMPO} BPM`,
    howTo: [
      'Press ▶ on scene 1 and walk down the scenes: Fog, Rain, Glass, Garden, Storm, Clearing.',
      'Nobody typed the melodies: open Bells or Drops and press Panel. The XY pad moves how dense and how restless they are.',
      'Press Randomize (toolbar) on the Bells or Drops track: the wiring stays, the seeds and knobs re-roll, and it composes something else.',
      'Hush on the Master panel fades everything down and back; the Arp track wakes only in the loud scenes (it listens to the pad\'s velocity).',
    ],
    create: createGlassRain,
  },
]

export const findExampleProject = (id: string): ExampleProject | undefined => exampleProjects.find((example) => example.id === id)

/** The example a first visit opens on. */
export const FLAGSHIP_EXAMPLE = 'low-light'
