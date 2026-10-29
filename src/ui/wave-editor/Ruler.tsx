import { frameCount } from '@core'
import { type WaveAudio, useWaveEditorStore } from '@state'
import { type RefObject, useEffect, useRef } from 'react'
import { currentView } from './current-view'
import { type RulerMode, rulerTicks } from './ruler-ticks'
import styles from './WaveEditor.module.css'

/** Time or bars and beats over the detail, redrawn with it (not by React) when the view moves. */
export const Ruler = ({ wave, detail, mode, bpm }: { wave: WaveAudio; detail: RefObject<HTMLDivElement | null>; mode: RulerMode; bpm: number }) => {
  const canvas = useRef<HTMLCanvasElement>(null)
  const { viewKey, audio } = wave

  useEffect(() => {
    let request = 0
    const draw = () => {
      request = 0
      const element = canvas.current
      const context = element?.getContext('2d')
      if (!element || !context || frameCount(audio) === 0) return
      const ratio = window.devicePixelRatio || 1
      const width = element.clientWidth
      const height = element.clientHeight
      element.width = Math.round(width * ratio)
      element.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      const style = getComputedStyle(element)
      context.fillStyle = style.getPropertyValue('--text-dim').trim() || '#888'
      context.font = `10px ${style.fontFamily}`
      context.textBaseline = 'top'
      for (const tick of rulerTicks(currentView(detail.current, wave), audio.sampleRate, mode, bpm)) {
        context.fillRect(Math.round(tick.x), 0, 1, height)
        context.fillText(tick.label, Math.round(tick.x) + 3, 2)
      }
    }
    const schedule = () => {
      if (!request) request = requestAnimationFrame(draw)
    }
    schedule()
    const unsubscribe = useWaveEditorStore.subscribe((state, previous) => {
      if (state.views[viewKey] !== previous.views[viewKey]) schedule()
    })
    const observer = new ResizeObserver(schedule)
    if (canvas.current) observer.observe(canvas.current)
    return () => {
      unsubscribe()
      observer.disconnect()
      if (request) cancelAnimationFrame(request)
    }
  }, [wave, audio, viewKey, detail, mode, bpm])

  return <canvas ref={canvas} className={styles.ruler} data-ruler={mode} aria-label={mode === 'time' ? 'Time ruler' : 'Beats ruler'} role="img" />
}
