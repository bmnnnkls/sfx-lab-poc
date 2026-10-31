import { columnsFor, frameCount } from '@core'
import { type Subject, type WaveAudio, type WaveChannels, toggleWavePreview, useSampleLibrary, useStatusStore, useWaveEditorStore, waveViewOf } from '@state'
import { type RefObject, useEffect, useMemo, useRef } from 'react'
import { IS_APPLE, keyOf } from '../commands/keys'
import { ActionMenu } from '../shared/menu'
import { laneColumns, waveformRenderer } from './lane-renderers'
import { WaveLane, type WaveLaneHandle } from './WaveLane'
import { currentView } from './current-view'
import { WHEEL_ZOOM, coversChannel, frameAt, menuTargetAt, resolveView, xOf, zoomAround } from './wave-geometry'
import { waveKeyAction } from './wave-keys'
import styles from './WaveEditor.module.css'

/** A press that moves less than this is a click (sets the cursor), not a drag (selects). */
const DRAG_PX = 3

/** Which channels a press selects: on a stereo sample, the top quarter of the left lane is left only, the bottom quarter of the right lane right only. */
const channelsAt = (element: HTMLElement, clientY: number, stereo: boolean): WaveChannels => {
  if (!stereo) return 'both'
  const box = element.getBoundingClientRect()
  const lane = box.height / 2
  const y = clientY - box.top
  if (y < lane / 4) return 'left'
  if (y > box.height - lane / 4) return 'right'
  return 'both'
}

/** The lane under the pointer: 0 (left, or the only one) or 1 (right). */
const laneAt = (element: HTMLElement, clientY: number, stereo: boolean): number => {
  if (!stereo) return 0
  const box = element.getBoundingClientRect()
  return clientY - box.top < box.height / 2 ? 0 : 1
}

/**
 * The lanes, one per channel, with the cursor, the selection and the preview's playhead. Zoom and scroll write to the
 * store and redraw the canvases in an animation frame; React renders only when the sample, the selection or the
 * cursor changes. `data-draw` says which band of `columnsFor` is drawn.
 *
 * The lanes take the focus on a press and are the `sample-selection` subject's menu trigger, so the right-click menu,
 * the edit keys (Delete, ⌘C, ⌘X, ⌘V) and the palette act on the selection.
 */
export const DetailView = ({ wave, frame }: { wave: WaveAudio; frame: RefObject<HTMLDivElement | null> }) => {
  const { viewKey, audio, pyramid } = wave
  const frames = frameCount(audio)
  const stereo = audio.channels.length > 1
  const lanes = useRef<Array<WaveLaneHandle | null>>([])
  const handles = useMemo(() => audio.channels.map((_, index) => (lane: WaveLaneHandle | null) => void (lanes.current[index] = lane)), [audio])
  const drag = useRef<{ anchor: number; startX: number; channels: WaveChannels; moved: boolean } | null>(null)
  const subject = useMemo<Subject>(() => ({ kind: 'sample-selection', sampleId: wave.sampleId }), [wave.sampleId])
  const library = useSampleLibrary()

  // Draws the lanes from the store, at most once per animation frame.
  useEffect(() => {
    let request = 0
    const draw = () => {
      request = 0
      const element = frame.current
      if (!element) return
      const view = currentView(element, wave)
      const columns = columnsFor(view, pyramid, audio)
      element.dataset.draw = columns.kind
      const { cursor, selection } = waveViewOf(useWaveEditorStore.getState().views, viewKey)
      lanes.current.forEach((lane, channel) => {
        const covers = selection && coversChannel(selection, channel)
        lane?.draw(laneColumns(columns, channel, view), {
          selection: covers ? { from: xOf(view, selection.from), to: xOf(view, selection.to) } : null,
          cursor: selection ? null : xOf(view, cursor),
        })
      })
    }
    const schedule = () => {
      if (!request) request = requestAnimationFrame(draw)
    }
    schedule()
    const unsubscribe = useWaveEditorStore.subscribe((state, previous) => {
      if (state.views[viewKey] !== previous.views[viewKey]) schedule()
    })
    const observer = new ResizeObserver(schedule)
    if (frame.current) observer.observe(frame.current)
    return () => {
      unsubscribe()
      observer.disconnect()
      if (request) cancelAnimationFrame(request)
    }
  }, [wave, audio, pyramid, viewKey, frame])

  // The wheel scrolls; with ⌘ or Ctrl (and a trackpad pinch, which arrives as one) it zooms around the pointer.
  useEffect(() => {
    const element = frame.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const view = currentView(element, wave)
      const store = useWaveEditorStore.getState()
      if (event.ctrlKey || event.metaKey) {
        const x = event.clientX - element.getBoundingClientRect().left
        const next = zoomAround(view, WHEEL_ZOOM ** (event.deltaY / 100), x, frames)
        store.setView(viewKey, { framesPerPixel: next.framesPerPixel, startFrame: next.startFrame })
      } else {
        const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
        const next = resolveView({ ...waveViewOf(store.views, viewKey), framesPerPixel: view.framesPerPixel, startFrame: view.startFrame + delta * view.framesPerPixel }, frames, view.width)
        store.setView(viewKey, { framesPerPixel: next.framesPerPixel, startFrame: next.startFrame })
      }
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [wave, viewKey, frames, frame])

  const frameOf = (event: React.MouseEvent<HTMLDivElement>) =>
    frameAt(currentView(event.currentTarget, wave), event.clientX - event.currentTarget.getBoundingClientRect().left, frames)

  return (
    <ActionMenu subject={subject}>
      <div
        ref={frame}
        className={styles.detail}
        data-testid="wave-detail"
        tabIndex={0}
        role="group"
        aria-label="Waveform lanes"
        onContextMenu={(event) => {
          // Runs before the menu opens: the menu acts on what was clicked.
          const store = useWaveEditorStore.getState()
          const target = menuTargetAt(waveViewOf(store.views, viewKey).selection, frameOf(event), laneAt(event.currentTarget, event.clientY, stereo))
          if (target === 'keep') return
          store.select(viewKey, null)
          store.setView(viewKey, { cursor: target.cursor })
        }}
        onKeyDown={(event) => {
          // The view keys (`waveKeyAction`); anything else goes on to the global keys and the browser.
          const key = keyOf(event, IS_APPLE)
          const store = useWaveEditorStore.getState()
          const action = key && waveKeyAction(key, waveViewOf(store.views, viewKey), frames, event.currentTarget.clientWidth)
          if (!action) return
          event.preventDefault()
          if (event.repeat && (action.play || action.zoom)) return
          if (action.selection !== undefined) store.select(viewKey, action.selection)
          if (action.cursor !== undefined || action.view) store.setView(viewKey, { ...(action.cursor !== undefined && { cursor: action.cursor }), ...action.view })
          if (action.zoom) store.zoom(viewKey, action.zoom)
          if (action.play) toggleWavePreview(library, wave.sampleId)
        }}
        onPointerDown={(event) => {
          event.currentTarget.focus({ preventScroll: true })
          if (event.button !== 0) return
          const store = useWaveEditorStore.getState()
          const at = frameOf(event)
          const { selection } = waveViewOf(store.views, viewKey)
          // Shift extends the selection from its far end.
          const anchor = event.shiftKey && selection ? (Math.abs(at - selection.from) > Math.abs(at - selection.to) ? selection.from : selection.to) : at
          const channels = event.shiftKey && selection ? selection.channels : channelsAt(event.currentTarget, event.clientY, stereo)
          drag.current = { anchor, startX: event.clientX, channels, moved: event.shiftKey && selection !== null }
          if (drag.current.moved) store.select(viewKey, { from: anchor, to: at, channels })
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          const current = drag.current
          if (!current) return
          if (!current.moved && Math.abs(event.clientX - current.startX) < DRAG_PX) return
          current.moved = true
          useWaveEditorStore.getState().select(viewKey, { from: current.anchor, to: frameOf(event), channels: current.channels })
        }}
        onPointerUp={(event) => {
          const current = drag.current
          drag.current = null
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
          if (current && !current.moved) {
            const store = useWaveEditorStore.getState()
            store.select(viewKey, null)
            store.setView(viewKey, { cursor: current.anchor })
          }
        }}
        onPointerCancel={() => {
          drag.current = null
        }}
      >
        {audio.channels.map((_, index) => (
          <WaveLane key={index} label={stereo ? (index === 0 ? 'Left' : 'Right') : 'Waveform'} renderer={waveformRenderer} handle={handles[index]!} />
        ))}
        <WavePlayhead wave={wave} frame={frame} />
      </div>
    </ActionMenu>
  )
}

/** The preview's position. Owns its status subscription, so nothing else renders at the status rate. */
const WavePlayhead = ({ wave, frame }: { wave: WaveAudio; frame: RefObject<HTMLDivElement | null> }) => {
  const at = useStatusStore((state) => (state.status?.preview?.sampleId === wave.sampleId ? state.status.preview.frame : null))
  if (at === null) return null
  const view = currentView(frame.current, wave)
  const x = xOf(view, at)
  if (x < 0 || x > view.width) return null
  return <div className={styles.playhead} data-testid="wave-playhead" style={{ left: x }} />
}
