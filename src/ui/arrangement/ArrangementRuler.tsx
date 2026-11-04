import { type RefObject, useEffect, useRef } from 'react'
import { formatBeat, ticks } from '../shared/timeline'
import { TIMELINE_BEAT_STEPS, beatLabel, timelineAxis } from './timeline-geometry'
import styles from './arrangement.module.css'

/**
 * Bars, beats and sixteenths over the lanes: a canvas the size of the visible timeline, kept at the left of it while
 * the content scrolls (sticky), and redrawn in an animation frame when it scrolls, zooms or resizes, not by React.
 */
export const ArrangementRuler = ({ scroller, pxPerBeat, headerWidth }: { scroller: RefObject<HTMLDivElement | null>; pxPerBeat: number; headerWidth: number }) => {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const element = canvas.current
    const scroll = scroller.current
    if (!element || !scroll) return
    let request = 0
    const draw = () => {
      request = 0
      const context = element.getContext('2d')
      if (!context) return
      const ratio = window.devicePixelRatio || 1
      // The visible timeline: the scroller less the header column, where the ruler's cell starts.
      const width = Math.max(1, scroll.clientWidth - (element.parentElement?.offsetLeft ?? 0))
      element.style.width = `${width}px`
      const height = element.clientHeight
      element.width = Math.round(width * ratio)
      element.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      const style = getComputedStyle(element)
      context.fillStyle = style.getPropertyValue('--text-dim').trim() || '#888'
      context.font = `10px ${style.fontFamily}`
      context.textBaseline = 'top'
      const axis = timelineAxis(scroll.scrollLeft, width, pxPerBeat)
      for (const tick of ticks(axis, 1, TIMELINE_BEAT_STEPS, (beats) => beatLabel(beats, formatBeat))) {
        const x = Math.round(tick.x)
        context.fillRect(x, 0, 1, height)
        context.fillText(tick.label, x + 3, 2)
      }
    }
    const schedule = () => {
      if (!request) request = requestAnimationFrame(draw)
    }
    schedule()
    scroll.addEventListener('scroll', schedule, { passive: true })
    const observer = new ResizeObserver(schedule)
    observer.observe(scroll)
    return () => {
      scroll.removeEventListener('scroll', schedule)
      observer.disconnect()
      if (request) cancelAnimationFrame(request)
    }
  }, [scroller, pxPerBeat, headerWidth])

  return <canvas ref={canvas} className={styles.rulerCanvas} aria-label="Timeline ruler" role="img" data-testid="arrangement-ruler" />
}
