import { type WaveView, nearestZeroCrossing } from '@core'
import { type WaveAudio, type WaveChannels, openWave, useWaveEditSettings, useWaveEditorStore, waveViewOf } from '@state'
import { marksOf } from './mark-geometry'
import { type RulerMode, rulerTicks } from './ruler-ticks'

/** A pointer gesture snaps to a target this close, in columns. */
export const SNAP_PX = 8

/** One frame a gesture may snap to, named so a drag can leave out what it moves (`marker:<id>`, `region:<id>:from`, `loop:to`). */
export interface SnapTarget {
  readonly frame: number
  readonly key: string
}

/** What gestures snap to now: fixed targets, and the zero crossing nearest a frame when that snap is on. */
export interface Snapping {
  readonly targets: readonly SnapTarget[]
  readonly zero?: (frame: number, radius: number) => number | null
}

/**
 * The nearest target within `SNAP_PX` columns of `frame` (a zero crossing is one more candidate), else the frame. No
 * snapping (null: both snaps off, or Alt held) leaves it. `ignore` leaves out the target a drag is moving.
 */
export const snapFrame = (frame: number, snapping: Snapping | null, view: WaveView, ignore?: string): number => {
  if (!snapping) return frame
  const radius = SNAP_PX * view.framesPerPixel
  let best = frame
  let distance = Infinity
  const consider = (candidate: number) => {
    const away = Math.abs(candidate - frame)
    if (away <= radius && away < distance) [best, distance] = [candidate, away]
  }
  for (const target of snapping.targets) if (target.key !== ignore) consider(target.frame)
  const zero = snapping.zero?.(frame, radius)
  if (zero !== null && zero !== undefined) consider(zero)
  return best
}

/** The ruler's mode and tempo, which the beat grid follows. */
export interface RulerNow {
  readonly mode: RulerMode
  readonly bpm: number
}

/**
 * What the open sample's gestures snap to now, from the snap settings: the beat grid at the ruler's step (with *Snap to
 * beats*, while the ruler counts beats), zero crossings of the selected channels (*Snap to zero crossings*), and, with
 * either on, every marker and region and loop edge. Null when both are off.
 */
export const waveSnapping = (wave: WaveAudio, view: WaveView, ruler: RulerNow): Snapping | null => {
  const { beats, zero } = useWaveEditSettings.getState().snap
  if (!beats && !zero) return null
  const sample = openWave(wave)?.sample
  const targets: SnapTarget[] = []
  if (sample) {
    const marks = marksOf(sample)
    for (const marker of marks.markers) targets.push({ frame: marker.frame, key: `marker:${marker.id}` })
    for (const region of marks.regions) targets.push({ frame: region.from, key: `region:${region.id}:from` }, { frame: region.to, key: `region:${region.id}:to` })
    if (marks.loop) targets.push({ frame: marks.loop.from, key: 'loop:from' }, { frame: marks.loop.to, key: 'loop:to' })
  }
  if (beats && ruler.mode === 'beats') {
    for (const tick of rulerTicks(view, wave.audio.sampleRate, 'beats', ruler.bpm)) {
      targets.push({ frame: Math.round(view.startFrame + tick.x * view.framesPerPixel), key: 'beat' })
    }
  }
  if (!zero) return { targets }
  const channels: WaveChannels = waveViewOf(useWaveEditorStore.getState().views, wave.viewKey).selection?.channels ?? 'both'
  return { targets, zero: (frame, radius) => nearestZeroCrossing(wave.audio, frame, channels, radius) }
}

/** How a gesture asks for a frame: snapped (unless Alt is held), leaving out what it moves. */
export type WaveSnap = (frame: number, view: WaveView, alt: boolean, ignore?: string) => number

/** The open sample's `WaveSnap`, reading the ruler as it is when a gesture asks. */
export const waveSnapper = (wave: WaveAudio, ruler: () => RulerNow): WaveSnap => (frame, view, alt, ignore) =>
  alt ? frame : snapFrame(frame, waveSnapping(wave, view, ruler()), view, ignore)
