import { type SpectrumAsk, askCovers, columnsFor, frameCount, onDemandColumnsFor, spectrumAsk, spectrumColumnsFor } from '@core'
import {
  type Subject,
  type WaveAudio,
  openWave,
  runAction,
  toggleWavePreview,
  useProjectStore,
  useSampleLibrary,
  useStatusStore,
  useWaveEditorStore,
  useWaveSpectrumStore,
  waveViewOf,
} from '@state'
import { type RefObject, useEffect, useMemo, useRef } from 'react'
import { IS_APPLE, keyOf } from '../commands/keys'
import { ActionMenu, useActionContext } from '../shared/menu'
import { laneColumns, spectrumLaneColumns } from './lane-renderers'
import { markLines, marksOf } from './mark-geometry'
import type { WaveSnap } from './snap'
import { WaveLane, type WaveLaneHandle } from './WaveLane'
import { currentView } from './current-view'
import { useLaneRenderers } from './use-lane-renderers'
import { laneAt, useWaveGestures } from './use-wave-gestures'
import { WHEEL_ZOOM, coversChannel, frameAt, menuTargetAt, resolveView, xOf, zoomAround } from './wave-geometry'
import { waveKeyAction } from './wave-keys'
import styles from './WaveEditor.module.css'

/**
 * The lanes, one per channel, with the cursor, the selection and the preview's playhead. Zoom and scroll write to the
 * store and redraw the canvases in an animation frame; React renders only when the sample, the selection or the
 * cursor changes. Each lane shows the lane mode's parts (`useLaneRenderers`): the waveform from `columnsFor`, the
 * spectrogram from `spectrumColumnsFor` over the sample's spectrum (`useWaveSpectrumStore`), which redraws as its
 * chunks arrive. Zoomed in past the spectrum's hop, the lanes draw its base columns stretched and, once the view has
 * stayed put for a frame, ask for the view's own columns (`spectrumAsk`), drawn while they cover it. `data-draw` says
 * which band of `columnsFor` is drawn, `data-spectrum` which of the spectrum's (or `pending` while its columns in view
 * aren't all there).
 *
 * The lanes take the focus on a press and are the `sample-selection` subject's menu trigger, so the right-click menu,
 * the edit keys (Delete, ⌘C, ⌘X, ⌘V) and the palette act on the selection; the view keys are theirs
 * (`waveKeyAction`), and the mouse is `useWaveGestures`.
 */
/** The frames `[` and `]` step between: every marker, region edge and loop edge of the open sample. */
const markFrames = (wave: WaveAudio): number[] => {
  const sample = openWave(wave)?.sample
  if (!sample) return []
  const { markers, regions, loop } = marksOf(sample)
  return [...markers.map((marker) => marker.frame), ...regions.flatMap((region) => [region.from, region.to]), ...(loop ? [loop.from, loop.to] : [])]
}

const MARK_ACTIONS = { marker: 'sample-selection.add-marker', region: 'sample-selection.make-region', loop: 'sample-selection.set-loop' } as const

export const DetailView = ({ wave, frame, snap }: { wave: WaveAudio; frame: RefObject<HTMLDivElement | null>; snap: WaveSnap }) => {
  const { viewKey, audio, pyramid } = wave
  const frames = frameCount(audio)
  const stereo = audio.channels.length > 1
  const lanes = useRef<Array<WaveLaneHandle | null>>([])
  const handles = useMemo(() => audio.channels.map((_, index) => (lane: WaveLaneHandle | null) => void (lanes.current[index] = lane)), [audio])
  const gestures = useWaveGestures(wave, snap)
  const context = useActionContext()
  const subject = useMemo<Subject>(() => ({ kind: 'sample-selection', sampleId: wave.sampleId, pane: wave.pane }), [wave.sampleId, wave.pane])
  const library = useSampleLibrary()
  const { lanes: mode, parts, renderers } = useLaneRenderers(audio.sampleRate)

  // Draws the lanes from the store, at most once per animation frame.
  useEffect(() => {
    let request = 0
    let asking = 0
    /** Asks for `ask` in the next frame, if the view hasn't moved by then. */
    const askSoon = (ask: SpectrumAsk) => {
      const at = useWaveEditorStore.getState().views[viewKey]
      cancelAnimationFrame(asking)
      asking = requestAnimationFrame(() => {
        if (useWaveEditorStore.getState().views[viewKey] === at) useWaveSpectrumStore.getState().ask(wave.pane, ask)
      })
    }
    const draw = () => {
      request = 0
      const element = frame.current
      if (!element) return
      const view = currentView(element, wave)
      const showsWave = parts.some((part) => part.kind === 'waveform')
      const showsSpectrum = parts.some((part) => part.kind === 'spectrogram')
      const columns = showsWave ? columnsFor(view, pyramid, audio) : null
      if (columns) element.dataset.draw = columns.kind
      else delete element.dataset.draw
      const spectra = useWaveSpectrumStore.getState()
      const spectrum = showsSpectrum ? spectra.spectra[wave.sampleId] : undefined
      let spectral = null
      if (spectrum) {
        const ask = spectrumAsk(view, wave.sampleId, spectrum.fftSize, frames)
        const answered = spectra.answers[wave.pane]
        if (ask && answered?.sampleId === wave.sampleId) spectral = onDemandColumnsFor(view, answered, frames)
        const asked = spectra.asks[wave.pane]
        if (ask && !spectral && !(asked?.sampleId === wave.sampleId && askCovers(asked, view, frames))) askSoon(ask)
        spectral ??= spectrumColumnsFor(view, spectrum.pyramid)
      }
      if (showsSpectrum) element.dataset.spectrum = !spectral || spectral.pending ? 'pending' : spectral.kind
      else delete element.dataset.spectrum
      const { cursor, selection } = waveViewOf(useWaveEditorStore.getState().views, viewKey)
      const sample = openWave(wave)?.sample
      const lines = sample ? markLines(view, marksOf(sample)) : { markers: [], edges: [] }
      lanes.current.forEach((lane, channel) => {
        const covers = selection && coversChannel(selection, channel)
        const data = {
          ...(columns && { waveform: laneColumns(columns, channel, view) }),
          ...(showsSpectrum && { spectrogram: spectral && spectrumLaneColumns(spectral, channel) }),
        }
        lane?.draw(data, {
          selection: covers ? { from: xOf(view, selection.from), to: xOf(view, selection.to) } : null,
          cursor: selection ? null : xOf(view, cursor),
          ...lines,
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
    // The marks' lines move with the sample's marks.
    const unsubscribeMarks = useProjectStore.subscribe((state, previous) => {
      if (state.project.samples !== previous.project.samples) schedule()
    })
    // The spectrum fills in chunk by chunk.
    const unsubscribeSpectrum = useWaveSpectrumStore.subscribe((state, previous) => {
      if (state.spectra[wave.sampleId] !== previous.spectra[wave.sampleId] || state.answers[wave.pane] !== previous.answers[wave.pane]) schedule()
    })
    const observer = new ResizeObserver(schedule)
    if (frame.current) observer.observe(frame.current)
    return () => {
      unsubscribe()
      unsubscribeMarks()
      unsubscribeSpectrum()
      observer.disconnect()
      if (request) cancelAnimationFrame(request)
      cancelAnimationFrame(asking)
    }
  }, [wave, audio, pyramid, viewKey, frame, parts, renderers, frames])

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
          const action = key && waveKeyAction(key, waveViewOf(store.views, viewKey), frames, event.currentTarget.clientWidth, markFrames(wave))
          if (!action) return
          event.preventDefault()
          if (event.repeat && (action.play || action.zoom || action.mark)) return
          if (action.selection !== undefined) store.select(viewKey, action.selection)
          if (action.cursor !== undefined || action.view) store.setView(viewKey, { ...(action.cursor !== undefined && { cursor: action.cursor }), ...action.view })
          if (action.zoom) store.zoom(viewKey, action.zoom)
          if (action.play) toggleWavePreview(library, wave)
          if (action.mark) void runAction(MARK_ACTIONS[action.mark], subject, context)
        }}
        {...gestures}
      >
        {audio.channels.map((_, index) => (
          <WaveLane key={index} label={stereo ? (index === 0 ? 'Left' : 'Right') : mode === 'spectrogram' ? 'Spectrogram' : 'Waveform'} parts={parts} renderers={renderers} handle={handles[index]!} />
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
