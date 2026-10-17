import { type Point, type Preview, type Values, MARGIN, PREVIEW_HEIGHT, PREVIEW_WIDTH, clamp, round } from './types'

const SIDE = 4
const TRACK = PREVIEW_WIDTH - 2 * SIDE
const BASE = PREVIEW_HEIGHT - MARGIN
const TOP = MARGIN
/** The most echoes drawn: after this many they are below anything visible, or too close to tell apart. */
const MAX_TAPS = 12
/** The picture spans this much time. */
const SPAN_SECONDS = 2

const bar = (x: number, level: number, tone: 'main' | 'dim') => ({
  kind: 'line' as const,
  points: [[round(x), BASE], [round(x), round(BASE - clamp(level, 0, 1) * (BASE - TOP))]] as Point[],
  tone,
})

/** Seconds per beat at the default tempo: the picture does not know the project's, so a synced delay is drawn as if at 120 BPM. */
const SECONDS_PER_BEAT = 0.5

/**
 * The echoes of a delay: the dry sound at the start, then a bar for each repeat `time` apart, `feedback` times as loud as
 * the one before, the first at the `mix` level. Repeats that no longer fit, or are inaudible, are left out. With Sync on beat,
 * `time` is in beats and the spacing is the one at 120 BPM.
 */
export const delayPreview = (values: Values): Preview => {
  const seconds = (values.time ?? 0.3) * (Math.round(values.sync ?? 0) === 1 ? SECONDS_PER_BEAT : 1)
  const time = clamp(seconds, 0.001, SPAN_SECONDS)
  const feedback = clamp(values.feedback ?? 0.4, 0, 0.95)
  const mix = clamp(values.mix ?? 0.35, 0, 1)
  const shapes = [bar(SIDE, 1, 'dim')]
  for (let tap = 1; tap <= MAX_TAPS; tap++) {
    const x = SIDE + ((tap * time) / SPAN_SECONDS) * TRACK
    const level = mix * feedback ** (tap - 1)
    if (x > SIDE + TRACK || level < 0.02) break
    shapes.push(bar(x, level, 'main'))
  }
  return { shapes }
}

/**
 * The tail of a reverb: after the predelay, a decay as long as the room is big (and slower where the highs are not damped),
 * as tall as the mix. The dry sound is the dim bar at the start.
 */
export const reverbPreview = (values: Values): Preview => {
  const size = clamp(values.size ?? 0.6, 0, 1)
  const damping = clamp(values.damping ?? 0.5, 0, 1)
  const predelay = clamp(values.predelay ?? 0, 0, 100)
  const mix = clamp(values.mix ?? 0.3, 0, 1)
  // About a quarter to nine tenths of the picture, by size; damping shortens it a little.
  const start = SIDE + 4 + (predelay / 100) * (TRACK * 0.25)
  // ...and never past the end of the picture.
  const length = Math.min(TRACK * clamp(0.25 + 0.65 * size - 0.12 * damping, 0.12, 0.9), SIDE + TRACK - start)
  const height = (BASE - TOP) * clamp(mix, 0.05, 1)
  const points: Point[] = []
  for (let i = 0; i <= 40; i++) {
    const t = i / 40
    points.push([round(start + t * length), round(BASE - height * Math.exp(-4 * t))])
  }
  return { shapes: [bar(SIDE, 1, 'dim'), { kind: 'area', points, baseline: BASE, tone: 'main' }] }
}
