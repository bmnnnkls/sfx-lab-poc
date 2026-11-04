import type { WaveView } from '@core'
import { BEAT_STEPS, type RulerTick, formatBeat, formatTime, ticks } from '../shared/timeline'

/** What the ruler counts: time (minutes, seconds, milliseconds; frames when zoomed in past one frame per pixel) or bars and beats. */
export type RulerMode = 'time' | 'beats'
/** Whose tempo the beats follow: the project's, or the one in the sample's name. */
export type RulerTempo = 'project' | 'sample'

export const isRulerMode = (value: unknown): value is RulerMode => value === 'time' || value === 'beats'
export const isRulerTempo = (value: unknown): value is RulerTempo => value === 'project' || value === 'sample'

export type { RulerTick } from '../shared/timeline'
export { formatBeat, formatTime } from '../shared/timeline'

const SECOND_STEPS = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60]
const FRAME_STEPS = [1, 2, 5, 10, 20, 50, 100]

/** The ticks every `step` units (a unit is `framesPerUnit` frames) that fall inside the view, labelled. */
const ticksEvery = (view: WaveView, framesPerUnit: number, steps: readonly number[], label: (units: number) => string): RulerTick[] =>
  ticks({ start: view.startFrame, perPixel: view.framesPerPixel, width: view.width }, framesPerUnit, steps, label)

/** The ruler's labelled ticks for what the view shows. */
export const rulerTicks = (view: WaveView, sampleRate: number, mode: RulerMode, bpm: number): RulerTick[] => {
  if (mode === 'beats') return ticksEvery(view, (60 / bpm) * sampleRate, BEAT_STEPS, formatBeat)
  if (view.framesPerPixel < 1) return ticksEvery(view, 1, FRAME_STEPS, (frame) => String(Math.round(frame)))
  return ticksEvery(view, sampleRate, SECOND_STEPS, formatTime)
}
