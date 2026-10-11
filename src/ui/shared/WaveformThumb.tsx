import { useSampleStore } from '@state'
import { useEffect, useRef } from 'react'
import styles from './WaveformThumb.module.css'

interface WaveformThumbProps {
  sampleId: string
  width?: number
  height?: number
}

/** Small waveform drawing for a library sample, with its load state when it isn't ready. */
export const WaveformThumb = ({ sampleId, width = 160, height = 32 }: WaveformThumbProps) => {
  const peaks = useSampleStore((state) => state.peaks[sampleId])
  const status = useSampleStore((state) => state.status[sampleId])
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const element = canvas.current
    const context = element?.getContext('2d')
    if (!element || !context) return
    context.clearRect(0, 0, width, height)
    if (!peaks) return

    context.fillStyle = getComputedStyle(element).getPropertyValue('--accent').trim() || '#f5a524'
    // One column per pixel: the loudest peak that falls under it, so any amount of detail draws cleanly.
    for (let x = 0; x < width; x++) {
      const from = Math.floor((x * peaks.length) / width)
      const to = Math.max(from + 1, Math.floor(((x + 1) * peaks.length) / width))
      let peak = 0
      for (let i = from; i < to; i++) peak = Math.max(peak, peaks[i] ?? 0)
      const barHeight = Math.max(1, peak * height)
      context.fillRect(x, (height - barHeight) / 2, 1, barHeight)
    }
  }, [peaks, width, height])

  const message =
    status === 'missing' ? 'audio missing' : status === 'error' ? 'could not decode' : status === 'loading' ? 'loading…' : null

  return (
    <div className={styles.thumb} style={{ width, height }} data-status={status ?? 'none'}>
      <canvas ref={canvas} width={width} height={height} />
      {message && <span className={styles.message}>{message}</span>}
    </div>
  )
}
