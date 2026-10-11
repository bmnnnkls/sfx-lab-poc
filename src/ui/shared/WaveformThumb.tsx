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
    const barWidth = width / peaks.length
    peaks.forEach((peak, index) => {
      const barHeight = Math.max(1, peak * height)
      context.fillRect(index * barWidth, (height - barHeight) / 2, Math.max(1, barWidth - 1), barHeight)
    })
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
