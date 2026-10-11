import { type AudioClip, MIN_REGION } from '@core'
import { useStatusStore } from '@state'
import { useRef } from 'react'
import { WaveformThumb } from '../shared/WaveformThumb'
import { useElementWidth } from '../shared/use-element-width'
import styles from './AudioClipEditor.module.css'

interface AudioWaveformProps {
  trackId: string
  clip: AudioClip
  /** Length of the whole sample, to draw fades at the right size. */
  sampleSeconds: number
  /** Called continuously while a trim handle is dragged; one gesture merges into one undo step. */
  onTrim(changes: { start: number } | { end: number }): void
}

const HEIGHT = 140

const percent = (fraction: number): string => `${fraction * 100}%`

/**
 * The sample's waveform with the clip's region marked by two draggable handles. In re-pitch mode the
 * beat grid and playhead are laid over the region (not the whole sample), because the region is
 * what spans the clip's length; seeing where the beats fall on the audio is how you tell whether
 * the length is right.
 */
export const AudioWaveform = ({ trackId, clip, sampleSeconds, onTrim }: AudioWaveformProps) => {
  const frame = useRef<HTMLDivElement>(null)
  const width = useElementWidth(frame)
  const locked = clip.warp === 'repitch'
  const { start, end } = clip
  const region = end - start

  const playhead = useStatusStore((state) => {
    const launcher = state.status?.tracks[trackId]
    if (!locked || !state.status || launcher?.playingClipId !== clip.id || launcher.startBeat === null) return null
    const phase = ((state.status.beat - launcher.startBeat) % clip.lengthBeats) / clip.lengthBeats
    return start + phase * region
  })

  const beats = Math.max(1, clip.lengthBeats)
  const gridLines = {
    left: percent(start),
    width: percent(region),
    '--beat': `calc(100% / ${beats})`,
    '--bar': `calc(100% * 4 / ${beats})`,
  } as React.CSSProperties

  // Fades are capped at half the region at playback, so draw them the same way.
  const fadeFraction = (seconds: number) => Math.min(seconds / sampleSeconds, region / 2)
  const fadeIn = fadeFraction(clip.fadeIn)
  const fadeOut = fadeFraction(clip.fadeOut)

  const drag = (edge: 'start' | 'end') => (event: React.PointerEvent<HTMLDivElement>) => {
    const element = frame.current
    if (!element) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const move = (moveEvent: PointerEvent) => {
      const box = element.getBoundingClientRect()
      const position = Math.min(1, Math.max(0, (moveEvent.clientX - box.left) / box.width))
      // Handles stop short of each other so the region never collapses.
      onTrim(
        edge === 'start'
          ? { start: Math.min(position, clip.end - MIN_REGION) }
          : { end: Math.max(position, clip.start + MIN_REGION) },
      )
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }

  return (
    <div ref={frame} className={styles.waveform} style={{ height: HEIGHT }} data-testid="audio-waveform">
      <WaveformThumb sampleId={clip.sampleId} width={width} height={HEIGHT} />
      {locked && <div className={styles.beatGrid} style={gridLines} />}

      <div className={styles.excluded} style={{ left: 0, width: percent(start) }} />
      <div className={styles.excluded} style={{ left: percent(end), right: 0 }} />

      <svg className={styles.fades} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {fadeIn > 0 && (
          <polyline data-testid="fade-in-shape" points={`${start * 100},100 ${(start + fadeIn) * 100},0`} />
        )}
        {fadeOut > 0 && (
          <polyline data-testid="fade-out-shape" points={`${(end - fadeOut) * 100},0 ${end * 100},100`} />
        )}
      </svg>

      {playhead !== null && <div className={styles.playhead} style={{ left: percent(playhead) }} />}

      <div
        className={`${styles.handle} ${styles.handleStart}`}
        style={{ left: percent(start) }}
        data-testid="trim-start"
        role="slider"
        aria-label="Trim start"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(start * 100)}
        onPointerDown={drag('start')}
      />
      <div
        className={`${styles.handle} ${styles.handleEnd}`}
        style={{ left: percent(end) }}
        data-testid="trim-end"
        role="slider"
        aria-label="Trim end"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(end * 100)}
        onPointerDown={drag('end')}
      />
    </div>
  )
}
