import { columnsFor, frameCount } from '@core'
import { type WaveAudio, useWaveEditorStore } from '@state'
import { type RefObject, useEffect, useRef } from 'react'
import { currentView } from './current-view'
import { clampView, fitFramesPerPixel } from './wave-geometry'
import styles from './WaveEditor.module.css'

/** Within this many pixels of the box's edge, a drag moves that edge (zooms) instead of the box. */
const EDGE_PX = 6

/**
 * The whole sample, with a box over what the detail shows. It is the detail's scrollbar (a native one can't be wide
 * enough at full zoom): drag the box to scroll, drag its edges to zoom, click elsewhere to centre there; focused, the
 * arrow keys, Page Up and Down, Home and End scroll.
 */
export const Overview = ({ wave, detail }: { wave: WaveAudio; detail: RefObject<HTMLDivElement | null> }) => {
  const { viewKey, audio, pyramid } = wave
  const frames = frameCount(audio)
  const strip = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<{ mode: 'move' | 'start' | 'end'; grab: number } | null>(null)

  /** Frames per overview pixel. */
  const scale = () => frames / Math.max(1, strip.current?.clientWidth ?? 1)

  useEffect(() => {
    let request = 0
    const draw = () => {
      request = 0
      const element = canvas.current
      const context = element?.getContext('2d')
      if (!element || !context) return
      const ratio = window.devicePixelRatio || 1
      const width = element.clientWidth
      const height = element.clientHeight
      element.width = Math.round(width * ratio)
      element.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      const columns = columnsFor({ startFrame: 0, framesPerPixel: fitFramesPerPixel(frames, width), width }, pyramid, audio)
      context.fillStyle = getComputedStyle(element).getPropertyValue('--text-dim').trim() || '#888'
      if (columns.kind !== 'points') {
        for (let x = 0; x < width; x++) {
          let low = Infinity
          let high = -Infinity
          for (let channel = 0; channel < columns.min.length; channel++) {
            low = Math.min(low, columns.min[channel]![x]!)
            high = Math.max(high, columns.max[channel]![x]!)
          }
          if (Number.isNaN(low) || !Number.isFinite(low)) continue
          const top = (1 - high) * (height / 2)
          context.fillRect(x, top, 1, Math.max(1, (1 - low) * (height / 2) - top))
        }
      }
    }
    const place = () => {
      const element = box.current
      const width = strip.current?.clientWidth ?? 0
      if (!element || width === 0) return
      const view = currentView(detail.current, wave)
      element.style.left = `${(view.startFrame / frames) * width}px`
      element.style.width = `${Math.max(2, ((view.width * view.framesPerPixel) / frames) * width)}px`
      const scrollbar = strip.current
      scrollbar?.setAttribute('aria-valuenow', String(Math.round(view.startFrame)))
      scrollbar?.setAttribute('aria-valuemax', String(Math.max(0, Math.round(frames - view.width * view.framesPerPixel))))
    }
    const schedule = () => {
      if (!request) request = requestAnimationFrame(() => (draw(), place()))
    }
    schedule()
    const unsubscribe = useWaveEditorStore.subscribe((state, previous) => {
      if (state.views[viewKey] !== previous.views[viewKey]) requestAnimationFrame(place)
    })
    const observer = new ResizeObserver(schedule)
    if (strip.current) observer.observe(strip.current)
    if (detail.current) observer.observe(detail.current)
    return () => {
      unsubscribe()
      observer.disconnect()
      if (request) cancelAnimationFrame(request)
    }
  }, [wave, audio, pyramid, frames, viewKey, detail])

  const show = (startFrame: number, framesPerPixel?: number) => {
    const store = useWaveEditorStore.getState()
    const view = currentView(detail.current, wave)
    const next = clampView({ startFrame, framesPerPixel: framesPerPixel ?? view.framesPerPixel, width: view.width }, frames)
    store.setView(viewKey, { startFrame: next.startFrame, framesPerPixel: next.framesPerPixel })
  }

  const frameAtPointer = (event: React.PointerEvent) => (event.clientX - (strip.current?.getBoundingClientRect().left ?? 0)) * scale()

  return (
    <div
      ref={strip}
      className={styles.overview}
      role="scrollbar"
      aria-label="Waveform position"
      aria-orientation="horizontal"
      aria-valuemin={0}
      tabIndex={0}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        const view = currentView(detail.current, wave)
        const span = view.width * view.framesPerPixel
        const at = frameAtPointer(event)
        const edge = EDGE_PX * scale()
        const mode = Math.abs(at - view.startFrame) <= edge ? 'start' : Math.abs(at - (view.startFrame + span)) <= edge ? 'end' : 'move'
        if (mode === 'move' && (at < view.startFrame || at > view.startFrame + span)) show(at - span / 2)
        const now = currentView(detail.current, wave)
        drag.current = { mode, grab: at - now.startFrame }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        const current = drag.current
        if (!current) return
        const view = currentView(detail.current, wave)
        const at = frameAtPointer(event)
        const end = view.startFrame + view.width * view.framesPerPixel
        if (current.mode === 'move') show(at - current.grab)
        else if (current.mode === 'start') show(Math.min(at, end - 1), (end - Math.min(at, end - 1)) / view.width)
        else show(view.startFrame, (Math.max(at, view.startFrame + 1) - view.startFrame) / view.width)
      }}
      onPointerUp={(event) => {
        drag.current = null
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      }}
      onPointerCancel={() => {
        drag.current = null
      }}
      onKeyDown={(event) => {
        const view = currentView(detail.current, wave)
        const span = view.width * view.framesPerPixel
        const by: Record<string, number> = { ArrowLeft: -span / 10, ArrowRight: span / 10, PageUp: -span, PageDown: span, Home: -frames, End: frames }
        const step = by[event.key]
        if (step === undefined) return
        event.preventDefault()
        show(view.startFrame + step)
      }}
    >
      <canvas ref={canvas} className={styles.overviewCanvas} />
      <div ref={box} className={styles.overviewBox} />
    </div>
  )
}
