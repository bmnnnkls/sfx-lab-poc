import type { WaveView } from '@core'

/** What the ruler counts: time (minutes, seconds, milliseconds; frames when zoomed in past one frame per pixel) or bars and beats. */
export type RulerMode = 'time' | 'beats'
/** Whose tempo the beats follow: the project's, or the one in the sample's name. */
export type RulerTempo = 'project' | 'sample'

export const isRulerMode = (value: unknown): value is RulerMode => value === 'time' || value === 'beats'
export const isRulerTempo = (value: unknown): value is RulerTempo => value === 'project' || value === 'sample'

export interface RulerTick {
  /** Columns from the left edge. */
  readonly x: number
  readonly label: string
}

/** Labels at least this far apart. */
const MIN_SPACING_PX = 72

const SECOND_STEPS = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60]
const FRAME_STEPS = [1, 2, 5, 10, 20, 50, 100]
/** In beats: sixteenths up to bars of 4/4 and more. */
const BEAT_STEPS = [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64]

/** m:ss.mmm */
export const formatTime = (seconds: number): string => {
  const millis = Math.round(seconds * 1000)
  const minutes = Math.floor(millis / 60000)
  const rest = millis - minutes * 60000
  return `${minutes}:${String(Math.floor(rest / 1000)).padStart(2, '0')}.${String(rest % 1000).padStart(3, '0')}`
}

/** Bar, beat and (off the beat) sixteenth, counted from 1, in 4/4 from frame 0. */
export const formatBeat = (beats: number): string => {
  const sixteenths = Math.round(beats * 4)
  const bar = Math.floor(sixteenths / 16) + 1
  const beat = Math.floor((sixteenths % 16) / 4) + 1
  const sixteenth = (sixteenths % 4) + 1
  return sixteenth === 1 ? `${bar}.${beat}` : `${bar}.${beat}.${sixteenth}`
}

/** The ticks every `step` units (a unit is `framesPerUnit` frames) that fall inside the view, labelled. */
const ticksEvery = (view: WaveView, framesPerUnit: number, steps: readonly number[], label: (units: number) => string): RulerTick[] => {
  const pxPerUnit = framesPerUnit / view.framesPerPixel
  const step = steps.find((candidate) => candidate * pxPerUnit >= MIN_SPACING_PX) ?? steps[steps.length - 1]!
  const firstUnit = view.startFrame / framesPerUnit
  const ticks: RulerTick[] = []
  for (let index = Math.max(0, Math.ceil(firstUnit / step - 1e-9)); ; index++) {
    const units = index * step
    const x = (units - firstUnit) * pxPerUnit
    if (x > view.width) return ticks
    ticks.push({ x, label: label(units) })
  }
}

/** The ruler's labelled ticks for what the view shows. */
export const rulerTicks = (view: WaveView, sampleRate: number, mode: RulerMode, bpm: number): RulerTick[] => {
  if (mode === 'beats') return ticksEvery(view, (60 / bpm) * sampleRate, BEAT_STEPS, formatBeat)
  if (view.framesPerPixel < 1) return ticksEvery(view, 1, FRAME_STEPS, (frame) => String(Math.round(frame)))
  return ticksEvery(view, sampleRate, SECOND_STEPS, formatTime)
}
